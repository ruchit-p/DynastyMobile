import React, { useState, useLayoutEffect, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  SafeAreaView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import AppHeader from '../../components/ui/AppHeader';
import IconButton, { IconSet } from '../../components/ui/IconButton';
import { Ionicons } from '@expo/vector-icons';
import EmptyState from '../../components/ui/EmptyState';
import { FlashList } from '../../components/ui/FlashList';
import { showErrorAlert , callFirebaseFunction } from '../../src/lib/errorUtils';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { useAuth } from '../../src/contexts/AuthContext';
import { useEncryption } from '../../src/contexts/EncryptionContext';
import { getFirebaseDb } from '../../src/lib/firebase';
import { collection, query, where, getDocs } from '@react-native-firebase/firestore';
import EncryptionIndicator from '../../components/encryption/EncryptionIndicator';
import { Colors } from '../../constants/Colors';
import { useThemeColor } from '../../hooks/useThemeColor';

interface FamilyMember {
  id: string;
  name: string;
  avatarUrl?: string;
  hasEncryption?: boolean;
}

const NewChatScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const { user, userData } = useAuth();
  const { isInitialized: isEncryptionInitialized, status: encryptionStatus } = useEncryption();
  
  const [searchText, setSearchText] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<FamilyMember[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({ light: Colors.light.border, dark: Colors.dark.border }, 'border');
  
  // Initialize error handler
  const { handleError, withErrorHandling } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'New Chat Error',
    trackCurrentScreen: true
  });

  // Load family members
  useEffect(() => {
    const loadFamilyMembers = withErrorHandling(async () => {
      if (!user || !userData?.familyTreeId) {
        setIsLoadingMembers(false);
        return;
      }

      try {
        const db = getFirebaseDb();
        const usersRef = collection(db, 'users');
        const q = query(
          usersRef, 
          where('familyTreeId', '==', userData.familyTreeId)
        );
        
        const snapshot = await getDocs(q);
        const members: FamilyMember[] = [];
        
        for (const doc of snapshot.docs) {
          if (doc.id !== user.uid) {
            const data = doc.data();
            
            // Check if member has encryption enabled
            const encryptionKeysRef = collection(db, 'encryptionKeys');
            const encryptionQuery = query(
              encryptionKeysRef,
              where('userId', '==', doc.id)
            );
            const encryptionSnapshot = await getDocs(encryptionQuery);
            const hasEncryption = !encryptionSnapshot.empty;
            
            members.push({
              id: doc.id,
              name: data.displayName || `${data.firstName} ${data.lastName}` || 'Unknown',
              avatarUrl: data.profilePicture?.url,
              hasEncryption,
            });
          }
        }
        
        setFamilyMembers(members);
      } finally {
        setIsLoadingMembers(false);
      }
    }, 'Failed to load family members');

    loadFamilyMembers();
  }, [user, userData, withErrorHandling]);

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <AppHeader
          title="New Encrypted Chat"
          headerLeft={() => (
            <IconButton
              iconName="arrow-back"
              iconSet={IconSet.Ionicons}
              size={28}
              color={Colors.light.primary}
              onPress={() => router.back()}
              accessibilityLabel="Go back"
            />
          )}
          headerRight={() => (
            <EncryptionIndicator status={encryptionStatus} />
          )}
        />
      ),
    });
  }, [navigation, router, encryptionStatus]);

  const toggleMemberSelection = (member: FamilyMember) => {
    setSelectedMembers(prevSelected => {
      const isSelected = prevSelected.find(m => m.id === member.id);
      if (isSelected) {
        return prevSelected.filter(m => m.id !== member.id);
      } else {
        return [...prevSelected, member];
      }
    });
  };

  const handleStartChat = withErrorHandling(async () => {
    if (selectedMembers.length === 0) {
      showErrorAlert({ message: "Please select at least one member to start a chat.", code: "invalid-argument" }, "No Selection");
      return;
    }

    // Check if all selected members have encryption
    const membersWithoutEncryption = selectedMembers.filter(m => !m.hasEncryption);
    if (membersWithoutEncryption.length > 0) {
      Alert.alert(
        'Encryption Not Available',
        `The following members haven't enabled encryption yet: ${membersWithoutEncryption.map(m => m.name).join(', ')}. They need to open the app to enable secure messaging.`,
        [{ text: 'OK' }]
      );
      return;
    }

    if (!isEncryptionInitialized) {
      Alert.alert(
        'Encryption Not Ready',
        'Your encryption is not initialized. Please try again in a moment.',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsCreatingChat(true);
    try {
      const participantIds = selectedMembers.map(m => m.id);
      const groupName = selectedMembers.length > 1 
        ? selectedMembers.map(m => m.name.split(' ')[0]).slice(0, 3).join(', ') + (selectedMembers.length > 3 ? '...' : '')
        : undefined;

      // Initialize encrypted chat
      const result = await callFirebaseFunction('initializeEncryptedChat', {
        participantIds,
        groupName,
      });

      if (result.success && result.chatId) {
        // Navigate to chat detail
        router.push({
          pathname: '/(screens)/chatDetail',
          params: {
            chatId: result.chatId,
            participantIds: participantIds.join(','),
            chatTitle: groupName || selectedMembers[0].name,
          },
        });
      }
    } finally {
      setIsCreatingChat(false);
    }
  }, 'Failed to create encrypted chat');

  const filteredMembers = familyMembers.filter(member =>
    member.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const renderMemberItem = ({ item }: { item: FamilyMember }) => {
    const isSelected = selectedMembers.find(m => m.id === item.id);
    
    return (
      <TouchableOpacity
        style={[
          styles.memberItem,
          isSelected && styles.memberItemSelected,
          { backgroundColor: isSelected ? Colors.light.primaryLight : backgroundColor }
        ]}
        onPress={() => toggleMemberSelection(item)}
        disabled={!item.hasEncryption}
      >
        <View style={styles.avatarContainer}>
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: borderColor }]}>
              <Ionicons name="person-outline" size={24} color={Colors.light.primary} />
            </View>
          )}
        </View>
        <View style={styles.memberInfo}>
          <Text style={[styles.memberName, { color: textColor }]}>{item.name}</Text>
          {!item.hasEncryption && (
            <Text style={styles.encryptionWarning}>Encryption not enabled</Text>
          )}
        </View>
        <View style={styles.checkboxContainer}>
          {item.hasEncryption ? (
            isSelected ? (
              <Ionicons name="checkmark-circle" size={26} color={Colors.light.primary} />
            ) : (
              <Ionicons name="ellipse-outline" size={26} color={Colors.light.gray} />
            )
          ) : (
            <Ionicons name="lock-closed-outline" size={20} color={Colors.light.gray} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ErrorBoundary screenName="NewChatScreen">
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
        <View style={[styles.searchContainer, { backgroundColor: borderColor }]}>
          <Ionicons name="search" size={20} color={Colors.light.gray} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: textColor }]}
            placeholder="Search family members..."
            value={searchText}
            onChangeText={setSearchText}
            placeholderTextColor={Colors.light.gray}
          />
        </View>

        {isLoadingMembers ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
            <Text style={[styles.loadingText, { color: textColor }]}>Loading family members...</Text>
          </View>
        ) : filteredMembers.length === 0 && searchText ? (
          <View style={styles.emptyListContainer}>
            <Text style={[styles.emptyListText, { color: textColor }]}>
              No members found for &quot;{searchText}&quot;
            </Text>
          </View>
        ) : filteredMembers.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <EmptyState
              icon="people-outline"
              title="No Family Members Available"
              description="Connect with your family members to start secure encrypted chats."
              iconSize={50}
            />
          </View>
        ) : (
          <FlashList
            data={filteredMembers}
            renderItem={renderMemberItem}
            keyExtractor={item => item.id}
            style={styles.listContainer}
            ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: borderColor }]} />}
            estimatedItemSize={70}
          />
        )}

        {selectedMembers.length > 0 && (
          <TouchableOpacity 
            style={[styles.startButton, isCreatingChat && styles.startButtonDisabled]}
            onPress={handleStartChat}
            disabled={isCreatingChat}
          >
            {isCreatingChat ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Ionicons name="lock-closed" size={20} color="white" style={styles.lockIcon} />
                <Text style={styles.startButtonText}>
                  Start Encrypted Chat ({selectedMembers.length})
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </SafeAreaView>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  listContainer: {
    flex: 1,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  memberItemSelected: {
    backgroundColor: '#E8F5E9',
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '500',
  },
  encryptionWarning: {
    fontSize: 12,
    color: Colors.light.warning,
    marginTop: 2,
  },
  checkboxContainer: {
    marginLeft: 12,
  },
  separator: {
    height: 1,
    marginLeft: 78,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyListText: {
    fontSize: 16,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startButton: {
    flexDirection: 'row',
    backgroundColor: Colors.light.primary,
    paddingVertical: 16,
    paddingHorizontal: 24,
    margin: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonDisabled: {
    opacity: 0.7,
  },
  lockIcon: {
    marginRight: 8,
  },
  startButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default NewChatScreen;