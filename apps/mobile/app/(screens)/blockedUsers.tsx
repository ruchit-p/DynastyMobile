import React, { useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import FlashList from '../../components/ui/FlashList';

// Mock data for blocked users - replace with actual data source
const MOCK_BLOCKED_USERS: { id: string; name: string; avatarUrl: null }[] = [];

interface BlockedUserItemProps {
  id: string;
  name: string;
  onUnblock: (userId: string) => Promise<void>;
}

const BlockedUserItem: React.FC<BlockedUserItemProps> = ({ id, name, onUnblock }) => {
  const { handleError } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Blocked User Item Error',
    trackCurrentScreen: false,
  });

  const handleUnblockPress = async () => {
    try {
      await onUnblock(id);
    } catch (error) {
      handleError(error, {
        functionName: 'handleUnblockPress',
        userId: id,
        userName: name,
      });
    }
  };

  return (
    <View style={styles.itemContainer}>
      <Text style={styles.itemName}>{name}</Text>
      <TouchableOpacity style={styles.unblockButton} onPress={handleUnblockPress}>
        <Text style={styles.unblockButtonText}>Unblock</Text>
      </TouchableOpacity>
    </View>
  );
};

const BlockedUsersScreen = () => {
  const navigation = useNavigation();
  const { handleError, withErrorHandling } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Blocked Users Error',
    trackCurrentScreen: true,
  });

  // Reset error state when component mounts
  useEffect(() => {
    // Error state is automatically reset by useErrorHandler
  }, []);

  useEffect(() => {
    const setNavigationOptions = withErrorHandling(async () => {
      navigation.setOptions({
        title: 'Blocked Users',
        headerStyle: { backgroundColor: '#F8F8F8' },
        headerTintColor: '#333333',
        headerTitleStyle: { fontWeight: '600' },
        headerBackTitleVisible: false,
      });
    }, { functionName: 'setNavigationOptions' });

    setNavigationOptions().catch(() => {
      // Error already handled by withErrorHandling
    });
  }, [navigation, withErrorHandling]);

  const handleUnblockUser = withErrorHandling(async (userId: string) => {
    try {
      console.log('Unblock user:', userId);
      // TODO: Implement unblock logic (remove from Firestore list, update UI)
      alert(`User ${userId} unblocked (mock).`);
    } catch (error) {
      handleError(error, {
        functionName: 'handleUnblockUser',
        userId,
      });
      throw error;
    }
  }, { functionName: 'handleUnblockUser' });

  return (
    <ErrorBoundary screenName="BlockedUsersScreen">
      <SafeAreaView style={styles.safeArea}>
        {MOCK_BLOCKED_USERS.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="shield-checkmark-outline" size={60} color="#BDBDBD" />
            <Text style={styles.emptyText}>No Blocked Users</Text>
            <Text style={styles.emptySubText}>You haven&apos;t blocked anyone yet.</Text>
          </View>
        ) : (
          <FlashList
            data={MOCK_BLOCKED_USERS}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <BlockedUserItem 
                  id={item.id} 
                  name={item.name} 
                  onUnblock={handleUnblockUser} 
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            style={styles.list}
            estimatedItemSize={70}
          />
        )}
      </SafeAreaView>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F0F0',
  },
  list: {
    flex: 1,
  },
  itemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#FFFFFF',
  },
  itemName: {
    fontSize: 16,
    color: '#333',
  },
  unblockButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
  },
  unblockButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E0E0E0',
    marginLeft: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    color: '#555',
    marginTop: 15,
    fontWeight: '600',
  },
  emptySubText: {
    fontSize: 14,
    color: '#777',
    marginTop: 5,
    textAlign: 'center',
  },
});

export default BlockedUsersScreen; 