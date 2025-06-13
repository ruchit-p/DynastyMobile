import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors } from '../../constants/Colors';
import { useThemeColor } from '../../hooks/useThemeColor';
import Avatar from '../../components/ui/Avatar';
import { callFirebaseFunction } from '../../src/lib/errorUtils';
import { ChatNotificationService } from '../../src/services/ChatNotificationService';
import { getFirebaseDb } from '../../src/lib/firebase';
import { format } from 'date-fns';
import { logger } from '../../src/services/LoggingService';

interface ChatInfoParams {
  chatId: string;
  chatTitle?: string;
}

interface ChatMember {
  userId: string;
  displayName: string;
  photoURL?: string;
  role: 'admin' | 'member';
  joinedAt: any;
  notifications: boolean;
}

interface ChatDetails {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  description?: string;
  createdAt: any;
  members: ChatMember[];
  messageCount: number;
  mediaCount: number;
}

export default function ChatInfoScreen() {
  const params = useLocalSearchParams<ChatInfoParams>();
  const router = useRouter();
  const { user } = useAuth();
  const [chatDetails, setChatDetails] = useState<ChatDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'border');

  // Load chat details
  const loadChatDetails = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Get chat details from Firebase function
      const result = await callFirebaseFunction('getChatDetails', {
        chatId: params.chatId,
      });

      if (result.success && result.chat) {
        setChatDetails(result.chat);
        
        // Check if current user is admin
        const currentMember = result.chat.members.find(
          (m: ChatMember) => m.userId === user?.uid
        );
        if (currentMember) {
          setIsAdmin(currentMember.role === 'admin');
          setNotificationsEnabled(currentMember.notifications);
        }

        // Get media count
        const db = getFirebaseDb();
        const mediaSnapshot = await db
          .collection('chats')
          .doc(params.chatId)
          .collection('messages')
          .where('type', 'in', ['media', 'file', 'voice'])
          .count()
          .get();
        
        setChatDetails(prev => prev ? {
          ...prev,
          mediaCount: mediaSnapshot.data().count
        } : null);
      }
    } catch (error) {
      logger.error('Failed to load chat details:', error);
      Alert.alert('Error', 'Failed to load chat information');
    } finally {
      setIsLoading(false);
    }
  }, [params.chatId, user?.uid]);

  useEffect(() => {
    loadChatDetails();
  }, [loadChatDetails]);

  // Toggle notifications
  const handleNotificationToggle = useCallback(async (value: boolean) => {
    try {
      setNotificationsEnabled(value);
      
      await callFirebaseFunction('updateChatNotifications', {
        chatId: params.chatId,
        muted: !value,
      });

      if (value) {
        await ChatNotificationService.unmuteChat(params.chatId);
      } else {
        await ChatNotificationService.muteChat(params.chatId);
      }
    } catch (error) {
      logger.error('Failed to update notifications:', error);
      setNotificationsEnabled(!value); // Revert
      Alert.alert('Error', 'Failed to update notification settings');
    }
  }, [params.chatId]);

  // Add members
  const handleAddMembers = useCallback(() => {
    router.push({
      pathname: '/(screens)/selectMembersScreen',
      params: {
        mode: 'add',
        chatId: params.chatId,
        excludeIds: chatDetails?.members.map(m => m.userId).join(','),
      },
    });
  }, [router, params.chatId, chatDetails]);

  // Remove member
  const handleRemoveMember = useCallback((member: ChatMember) => {
    const isRemovingSelf = member.userId === user?.uid;
    
    Alert.alert(
      isRemovingSelf ? 'Leave Group' : 'Remove Member',
      isRemovingSelf 
        ? 'Are you sure you want to leave this group?'
        : `Remove ${member.displayName} from the group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isRemovingSelf ? 'Leave' : 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await callFirebaseFunction('removeChatMember', {
                chatId: params.chatId,
                memberId: member.userId,
              });

              if (isRemovingSelf) {
                router.back();
                router.back(); // Go back to chat list
              } else {
                loadChatDetails(); // Reload
              }
            } catch (error) {
              logger.error('Failed to remove member:', error);
              Alert.alert('Error', 'Failed to remove member');
            }
          },
        },
      ]
    );
  }, [user, params.chatId, router, loadChatDetails]);

  // Update member role
  const handleUpdateRole = useCallback((member: ChatMember) => {
    const newRole = member.role === 'admin' ? 'member' : 'admin';
    
    Alert.alert(
      'Update Role',
      `Make ${member.displayName} ${newRole === 'admin' ? 'an admin' : 'a member'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: async () => {
            try {
              await callFirebaseFunction('updateMemberRole', {
                chatId: params.chatId,
                memberId: member.userId,
                role: newRole,
              });
              loadChatDetails();
            } catch (error) {
              logger.error('Failed to update role:', error);
              Alert.alert('Error', 'Failed to update member role');
            }
          },
        },
      ]
    );
  }, [params.chatId, loadChatDetails]);

  // Edit group info
  const handleEditGroupInfo = useCallback(() => {
    // TODO: Navigate to edit group screen
    Alert.alert('Edit Group', 'Group editing feature coming soon');
  }, []);

  // View media
  const handleViewMedia = useCallback(() => {
    router.push({
      pathname: '/(screens)/chatDetail',
      params: {
        chatId: params.chatId,
        showMediaGallery: 'true',
      },
    });
  }, [router, params.chatId]);

  // Delete chat
  const handleDeleteChat = useCallback(() => {
    Alert.alert(
      'Delete Chat',
      chatDetails?.type === 'group' 
        ? 'This will delete the chat for everyone. This action cannot be undone.'
        : 'Delete this chat? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await callFirebaseFunction('deleteChat', {
                chatId: params.chatId,
              });
              router.back();
              router.back(); // Go back to chat list
            } catch (error) {
              logger.error('Failed to delete chat:', error);
              Alert.alert('Error', 'Failed to delete chat');
            }
          },
        },
      ]
    );
  }, [params.chatId, chatDetails, router]);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor }]}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
      </View>
    );
  }

  if (!chatDetails) {
    return (
      <View style={[styles.errorContainer, { backgroundColor }]}>
        <Text style={[styles.errorText, { color: textColor }]}>
          Failed to load chat information
        </Text>
      </View>
    );
  }

  const isGroup = chatDetails.type === 'group';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Avatar
            size={80}
            name={chatDetails.name || params.chatTitle || 'Chat'}
            uri={undefined} // TODO: Add group photo support
          />
          <Text style={[styles.chatName, { color: textColor }]}>
            {chatDetails.name || params.chatTitle || 'Chat'}
          </Text>
          {chatDetails.description && (
            <Text style={[styles.chatDescription, { color: textColor + '80' }]}>
              {chatDetails.description}
            </Text>
          )}
          {isGroup && isAdmin && (
            <TouchableOpacity
              style={[styles.editButton, { backgroundColor: Colors.light.primary }]}
              onPress={handleEditGroupInfo}
            >
              <Ionicons name="pencil" size={16} color="white" />
              <Text style={styles.editButtonText}>Edit Group</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Actions */}
        <View style={[styles.section, { borderColor }]}>
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => router.push({
              pathname: '/(screens)/chatSearch',
              params: { chatId: params.chatId }
            })}
          >
            <Ionicons name="search" size={24} color={Colors.light.primary} />
            <Text style={[styles.actionText, { color: textColor }]}>Search in Chat</Text>
            <Ionicons name="chevron-forward" size={20} color={borderColor} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionRow}
            onPress={handleViewMedia}
          >
            <Ionicons name="images" size={24} color={Colors.light.primary} />
            <Text style={[styles.actionText, { color: textColor }]}>
              Media & Files ({chatDetails.mediaCount})
            </Text>
            <Ionicons name="chevron-forward" size={20} color={borderColor} />
          </TouchableOpacity>

          <View style={styles.actionRow}>
            <Ionicons name="notifications" size={24} color={Colors.light.primary} />
            <Text style={[styles.actionText, { color: textColor }]}>Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationToggle}
              trackColor={{ false: borderColor, true: Colors.light.primary }}
            />
          </View>
        </View>

        {/* Chat Info */}
        <View style={[styles.section, { borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Information</Text>
          
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: textColor + '80' }]}>Created</Text>
            <Text style={[styles.infoValue, { color: textColor }]}>
              {format(chatDetails.createdAt.toDate(), 'MMM d, yyyy')}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: textColor + '80' }]}>Messages</Text>
            <Text style={[styles.infoValue, { color: textColor }]}>
              {chatDetails.messageCount.toLocaleString()}
            </Text>
          </View>

          {isGroup && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: textColor + '80' }]}>Members</Text>
              <Text style={[styles.infoValue, { color: textColor }]}>
                {chatDetails.members.length}
              </Text>
            </View>
          )}
        </View>

        {/* Members */}
        <View style={[styles.section, { borderColor }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>
              {isGroup ? 'Members' : 'Participants'}
            </Text>
            {isGroup && isAdmin && (
              <TouchableOpacity onPress={handleAddMembers}>
                <Ionicons name="person-add" size={20} color={Colors.light.primary} />
              </TouchableOpacity>
            )}
          </View>

          {chatDetails.members.map((member) => {
            const isCurrentUser = member.userId === user?.uid;
            
            return (
              <TouchableOpacity
                key={member.userId}
                style={styles.memberRow}
                onPress={() => {
                  if (!isCurrentUser && isGroup && isAdmin) {
                    Alert.alert(
                      member.displayName,
                      'What would you like to do?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: member.role === 'admin' ? 'Remove Admin' : 'Make Admin',
                          onPress: () => handleUpdateRole(member),
                        },
                        {
                          text: 'Remove from Group',
                          style: 'destructive',
                          onPress: () => handleRemoveMember(member),
                        },
                      ]
                    );
                  }
                }}
                disabled={!isGroup || !isAdmin || isCurrentUser}
              >
                <Avatar
                  size={40}
                  name={member.displayName}
                  uri={member.photoURL}
                />
                <View style={styles.memberInfo}>
                  <View style={styles.memberNameRow}>
                    <Text style={[styles.memberName, { color: textColor }]}>
                      {member.displayName} {isCurrentUser && '(You)'}
                    </Text>
                    {member.role === 'admin' && (
                      <View style={[styles.adminBadge, { backgroundColor: Colors.light.primary + '20' }]}>
                        <Text style={[styles.adminBadgeText, { color: Colors.light.primary }]}>
                          Admin
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.memberJoined, { color: textColor + '80' }]}>
                    Joined {format(member.joinedAt.toDate(), 'MMM d, yyyy')}
                  </Text>
                </View>
                {isGroup && isAdmin && !isCurrentUser && (
                  <Ionicons name="ellipsis-vertical" size={20} color={borderColor} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Danger Zone */}
        <View style={[styles.section, { borderColor }]}>
          <TouchableOpacity
            style={styles.dangerButton}
            onPress={() => handleRemoveMember({ userId: user!.uid } as ChatMember)}
          >
            <Ionicons name="exit-outline" size={20} color={Colors.light.error} />
            <Text style={[styles.dangerButtonText, { color: Colors.light.error }]}>
              {isGroup ? 'Leave Group' : 'Leave Chat'}
            </Text>
          </TouchableOpacity>

          {((isGroup && isAdmin) || !isGroup) && (
            <TouchableOpacity
              style={styles.dangerButton}
              onPress={handleDeleteChat}
            >
              <Ionicons name="trash-outline" size={20} color={Colors.light.error} />
              <Text style={[styles.dangerButtonText, { color: Colors.light.error }]}>
                Delete Chat
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  chatName: {
    fontSize: 24,
    fontWeight: '600',
    marginTop: 12,
  },
  chatDescription: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 12,
    gap: 4,
  },
  editButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    borderTopWidth: 1,
    paddingVertical: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  actionText: {
    flex: 1,
    fontSize: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 14,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '500',
  },
  memberJoined: {
    fontSize: 12,
    marginTop: 2,
  },
  adminBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  adminBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  dangerButtonText: {
    fontSize: 16,
  },
});