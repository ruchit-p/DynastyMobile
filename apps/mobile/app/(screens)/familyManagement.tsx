import React, { useEffect, useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image
} from 'react-native';
import { useNavigation, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { commonHeaderOptions } from '../../constants/headerConfig';
import { useAuth } from '../../src/contexts/AuthContext';
import { getFirebaseDb } from '../../src/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import ErrorBoundary from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import Fonts from '../../constants/Fonts';

// MARK: - Types
interface FamilyMember {
  id: string;
  displayName: string;
  email: string;
  role: 'admin' | 'member';
  profilePicture?: string;
  joinedAt: Date;
  status: 'active' | 'pending';
}

interface FamilyInvitation {
  id: string;
  email: string;
  sentAt: Date;
  sentBy: string;
  status: 'pending' | 'accepted' | 'declined';
}

interface FamilyData {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  members: FamilyMember[];
  invitations: FamilyInvitation[];
}

const FamilyManagementScreen = () => {
  const navigation = useNavigation();
  const { user, firestoreUser } = useAuth();
  const db = getFirebaseDb();
  
  // Error handling setup
  const { handleError, withErrorHandling, isError, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Family Management Error',
    trackCurrentScreen: true
  });

  // State
  const [familyData, setFamilyData] = useState<FamilyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Clear local errors when global error state resets
  useEffect(() => {
    if (!isError) {
      // Could clear any local error states here if needed
    }
  }, [isError]);

  useEffect(() => {
    navigation.setOptions({
      ...commonHeaderOptions,
      title: 'Family Management',
    });
  }, [navigation]);

  // MARK: - Data Loading Functions
  const loadFamilyData = withErrorHandling(async () => {
    if (!user?.uid || !firestoreUser?.familyId) {
      throw new Error('User not authenticated or not part of a family');
    }

    setLoading(true);

    try {
      // Load family document
      const familyQuery = query(
        collection(db, 'families'),
        where('id', '==', firestoreUser.familyId)
      );
      const familySnapshot = await getDocs(familyQuery);

      if (familySnapshot.empty) {
        throw new Error('Family not found');
      }

      const familyDoc = familySnapshot.docs[0];
      const familyInfo = familyDoc.data();

      // Load family members
      const membersQuery = query(
        collection(db, 'users'),
        where('familyId', '==', firestoreUser.familyId)
      );
      const membersSnapshot = await getDocs(membersQuery);

      const members: FamilyMember[] = membersSnapshot.docs.map(doc => {
        const userData = doc.data();
        return {
          id: doc.id,
          displayName: userData.displayName || 'Unknown',
          email: userData.email || '',
          role: userData.role || 'member',
          profilePicture: userData.profilePicture,
          joinedAt: userData.joinedAt?.toDate() || new Date(),
          status: 'active'
        };
      });

      // Load pending invitations
      const invitationsQuery = query(
        collection(db, 'familyInvitations'),
        where('familyId', '==', firestoreUser.familyId),
        where('status', '==', 'pending')
      );
      const invitationsSnapshot = await getDocs(invitationsQuery);

      const invitations: FamilyInvitation[] = invitationsSnapshot.docs.map(doc => {
        const inviteData = doc.data();
        return {
          id: doc.id,
          email: inviteData.email || '',
          sentAt: inviteData.sentAt?.toDate() || new Date(),
          sentBy: inviteData.sentBy || '',
          status: 'pending'
        };
      });

      const family: FamilyData = {
        id: familyDoc.id,
        name: familyInfo.name || 'Our Family',
        description: familyInfo.description,
        createdBy: familyInfo.createdBy || '',
        members,
        invitations
      };

      setFamilyData(family);
    } catch (error) {
      handleError(error, { 
        context: 'loadFamilyData',
        familyId: firestoreUser.familyId,
        userId: user.uid
      });
      throw error;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  });

  // MARK: - Member Management Functions
  const updateMemberRole = withErrorHandling(async (memberId: string, newRole: 'admin' | 'member') => {
    if (!user?.uid || !familyData) {
      throw new Error('Invalid state for updating member role');
    }

    // Check if current user is admin
    const currentMember = familyData.members.find(m => m.id === user.uid);
    if (currentMember?.role !== 'admin') {
      throw new Error('You must be an admin to change member roles');
    }

    setActionLoading(`role-${memberId}`);

    try {
      const memberRef = doc(db, 'users', memberId);
      await updateDoc(memberRef, { role: newRole });

      // Update local state
      setFamilyData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          members: prev.members.map(member =>
            member.id === memberId ? { ...member, role: newRole } : member
          )
        };
      });

      Alert.alert('Success', `Member role updated to ${newRole}`);
    } catch (error) {
      handleError(error, { 
        context: 'updateMemberRole',
        memberId,
        newRole,
        familyId: familyData.id
      });
    } finally {
      setActionLoading(null);
    }
  });

  const removeMember = withErrorHandling(async (memberId: string) => {
    if (!user?.uid || !familyData) {
      throw new Error('Invalid state for removing member');
    }

    // Check if current user is admin
    const currentMember = familyData.members.find(m => m.id === user.uid);
    if (currentMember?.role !== 'admin') {
      throw new Error('You must be an admin to remove members');
    }

    // Prevent removing yourself
    if (memberId === user.uid) {
      throw new Error('You cannot remove yourself from the family');
    }

    setActionLoading(`remove-${memberId}`);

    try {
      const memberRef = doc(db, 'users', memberId);
      await updateDoc(memberRef, { 
        familyId: null,
        role: null 
      });

      // Update local state
      setFamilyData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          members: prev.members.filter(member => member.id !== memberId)
        };
      });

      Alert.alert('Success', 'Member removed from family');
    } catch (error) {
      handleError(error, { 
        context: 'removeMember',
        memberId,
        familyId: familyData.id
      });
    } finally {
      setActionLoading(null);
    }
  });

  // MARK: - Invitation Management Functions
  const sendInvitation = withErrorHandling(async (email: string) => {
    if (!user?.uid || !familyData) {
      throw new Error('Invalid state for sending invitation');
    }

    // Check if current user is admin
    const currentMember = familyData.members.find(m => m.id === user.uid);
    if (currentMember?.role !== 'admin') {
      throw new Error('You must be an admin to send invitations');
    }

    // Check if email is already a member or has pending invitation
    const existingMember = familyData.members.find(m => m.email === email.toLowerCase());
    const existingInvitation = familyData.invitations.find(i => i.email === email.toLowerCase());

    if (existingMember) {
      throw new Error('This person is already a family member');
    }
    if (existingInvitation) {
      throw new Error('An invitation has already been sent to this email');
    }

    setActionLoading('send-invitation');

    try {
      const invitation = {
        familyId: familyData.id,
        email: email.toLowerCase(),
        sentAt: new Date(),
        sentBy: user.uid,
        status: 'pending'
      };

      const inviteRef = await addDoc(collection(db, 'familyInvitations'), invitation);

      // Update local state
      const newInvitation: FamilyInvitation = {
        id: inviteRef.id,
        ...invitation
      };

      setFamilyData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          invitations: [...prev.invitations, newInvitation]
        };
      });

      Alert.alert('Success', `Invitation sent to ${email}`);
    } catch (error) {
      handleError(error, { 
        context: 'sendInvitation',
        email,
        familyId: familyData.id
      });
    } finally {
      setActionLoading(null);
    }
  });

  const cancelInvitation = withErrorHandling(async (invitationId: string) => {
    if (!user?.uid || !familyData) {
      throw new Error('Invalid state for canceling invitation');
    }

    setActionLoading(`cancel-${invitationId}`);

    try {
      const inviteRef = doc(db, 'familyInvitations', invitationId);
      await deleteDoc(inviteRef);

      // Update local state
      setFamilyData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          invitations: prev.invitations.filter(invitation => invitation.id !== invitationId)
        };
      });

      Alert.alert('Success', 'Invitation canceled');
    } catch (error) {
      handleError(error, { 
        context: 'cancelInvitation',
        invitationId,
        familyId: familyData.id
      });
    } finally {
      setActionLoading(null);
    }
  });

  // MARK: - UI Helper Functions
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadFamilyData();
  }, []);

  const handleInvitePress = useCallback(() => {
    Alert.prompt(
      'Invite Family Member',
      'Enter the email address of the person you want to invite:',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Send Invitation', 
          onPress: (email) => {
            if (email && email.trim()) {
              sendInvitation(email.trim());
            }
          }
        }
      ],
      'plain-text'
    );
  }, [sendInvitation]);

  const handleMemberAction = useCallback((member: FamilyMember) => {
    const currentMember = familyData?.members.find(m => m.id === user?.uid);
    const isAdmin = currentMember?.role === 'admin';
    const isSelf = member.id === user?.uid;

    if (!isAdmin || isSelf) return;

    Alert.alert(
      'Member Actions',
      `What would you like to do with ${member.displayName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: member.role === 'admin' ? 'Make Member' : 'Make Admin',
          onPress: () => updateMemberRole(member.id, member.role === 'admin' ? 'member' : 'admin')
        },
        {
          text: 'Remove from Family',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirm Removal',
              `Are you sure you want to remove ${member.displayName} from the family?`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => removeMember(member.id) }
              ]
            );
          }
        }
      ]
    );
  }, [familyData, user, updateMemberRole, removeMember]);

  // Load initial data
  useEffect(() => {
    loadFamilyData();
  }, []);

  // MARK: - Render Functions
  const renderMember = (member: FamilyMember) => {
    const currentMember = familyData?.members.find(m => m.id === user?.uid);
    const isAdmin = currentMember?.role === 'admin';
    const isSelf = member.id === user?.uid;
    const isLoading = actionLoading === `role-${member.id}` || actionLoading === `remove-${member.id}`;

    return (
      <TouchableOpacity
        key={member.id}
        style={styles.memberItem}
        onPress={() => handleMemberAction(member)}
        disabled={!isAdmin || isSelf || isLoading}
      >
        <View style={styles.memberInfo}>
          <View style={styles.memberAvatar}>
            {member.profilePicture ? (
              <Image source={{ uri: member.profilePicture }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={24} color="#666" />
            )}
          </View>
          <View style={styles.memberDetails}>
            <Text style={styles.memberName}>{member.displayName}{isSelf && ' (You)'}</Text>
            <Text style={styles.memberEmail}>{member.email}</Text>
            <Text style={styles.memberRole}>{member.role}</Text>
          </View>
        </View>
        {isLoading ? (
          <ActivityIndicator size="small" color="#1A4B44" />
        ) : (
          isAdmin && !isSelf && <Ionicons name="chevron-forward" size={20} color="#666" />
        )}
      </TouchableOpacity>
    );
  };

  const renderInvitation = (invitation: FamilyInvitation) => {
    const isLoading = actionLoading === `cancel-${invitation.id}`;

    return (
      <View key={invitation.id} style={styles.invitationItem}>
        <View style={styles.invitationInfo}>
          <Text style={styles.invitationEmail}>{invitation.email}</Text>
          <Text style={styles.invitationStatus}>Pending • {invitation.sentAt.toLocaleDateString()}</Text>
        </View>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => cancelInvitation(invitation.id)}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#ff4444" />
          ) : (
            <Ionicons name="close" size={20} color="#ff4444" />
          )}
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <ErrorBoundary screenName="FamilyManagementScreen">
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1A4B44" />
            <Text style={styles.loadingText}>Loading family data...</Text>
          </View>
        </SafeAreaView>
      </ErrorBoundary>
    );
  }

  if (!familyData) {
    return (
      <ErrorBoundary screenName="FamilyManagementScreen">
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={60} color="#666" />
            <Text style={styles.errorText}>Unable to load family data</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadFamilyData}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </ErrorBoundary>
    );
  }

  const currentMember = familyData.members.find(m => m.id === user?.uid);
  const isAdmin = currentMember?.role === 'admin';

  return (
    <ErrorBoundary screenName="FamilyManagementScreen">
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.container}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Family Info Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Family Information</Text>
            <View style={styles.familyInfo}>
              <Text style={styles.familyName}>{familyData.name}</Text>
              {familyData.description && (
                <Text style={styles.familyDescription}>{familyData.description}</Text>
              )}
              <Text style={styles.familyStats}>
                {familyData.members.length} members • {familyData.invitations.length} pending invitations
              </Text>
            </View>
          </View>

          {/* Members Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Family Members</Text>
              {isAdmin && (
                <TouchableOpacity
                  style={styles.inviteButton}
                  onPress={handleInvitePress}
                  disabled={actionLoading === 'send-invitation'}
                >
                  {actionLoading === 'send-invitation' ? (
                    <ActivityIndicator size="small" color="#1A4B44" />
                  ) : (
                    <Ionicons name="person-add" size={20} color="#1A4B44" />
                  )}
                </TouchableOpacity>
              )}
            </View>
            {familyData.members.map(renderMember)}
          </View>

          {/* Pending Invitations Section */}
          {familyData.invitations.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pending Invitations</Text>
              {familyData.invitations.map(renderInvitation)}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F0F0',
  },
  container: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    fontFamily: Fonts.regular,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
    fontFamily: Fonts.regular,
  },
  retryButton: {
    backgroundColor: '#1A4B44',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Fonts.medium,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A4B44',
    fontFamily: Fonts.semiBold,
  },
  familyInfo: {
    marginTop: 12,
  },
  familyName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A4B44',
    marginBottom: 8,
    fontFamily: Fonts.bold,
  },
  familyDescription: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
    fontFamily: Fonts.regular,
  },
  familyStats: {
    fontSize: 14,
    color: '#888',
    fontFamily: Fonts.regular,
  },
  inviteButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#E8F4F8',
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  memberDetails: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A4B44',
    fontFamily: Fonts.semiBold,
  },
  memberEmail: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
    fontFamily: Fonts.regular,
  },
  memberRole: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
    textTransform: 'capitalize',
    fontFamily: Fonts.regular,
  },
  invitationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  invitationInfo: {
    flex: 1,
  },
  invitationEmail: {
    fontSize: 16,
    color: '#1A4B44',
    fontFamily: Fonts.medium,
  },
  invitationStatus: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
    fontFamily: Fonts.regular,
  },
  cancelButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FFE8E8',
  },
});

export default FamilyManagementScreen;