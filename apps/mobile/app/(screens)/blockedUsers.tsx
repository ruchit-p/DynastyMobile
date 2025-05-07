import React, { useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity } from 'react-native';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// Mock data for blocked users - replace with actual data source
const MOCK_BLOCKED_USERS = [
  { id: '1', name: 'User Alpha', avatarUrl: null },
  { id: '2', name: 'User Beta', avatarUrl: null },
  { id: '3', name: 'User Gamma', avatarUrl: null },
];

interface BlockedUserItemProps {
  id: string;
  name: string;
  onUnblock: (userId: string) => void;
}

const BlockedUserItem: React.FC<BlockedUserItemProps> = ({ id, name, onUnblock }) => {
  return (
    <View style={styles.itemContainer}>
      <Text style={styles.itemName}>{name}</Text>
      <TouchableOpacity style={styles.unblockButton} onPress={() => onUnblock(id)}>
        <Text style={styles.unblockButtonText}>Unblock</Text>
      </TouchableOpacity>
    </View>
  );
};

const BlockedUsersScreen = () => {
  const navigation = useNavigation();
  // TODO: Fetch actual blocked users list and implement unblock logic with backend

  useEffect(() => {
    navigation.setOptions({
      title: 'Blocked Users',
      headerStyle: { backgroundColor: '#F8F8F8' },
      headerTintColor: '#333333',
      headerTitleStyle: { fontWeight: '600' },
      headerBackTitleVisible: false,
    });
  }, [navigation]);

  const handleUnblockUser = (userId: string) => {
    console.log('Unblock user:', userId);
    // TODO: Implement unblock logic (remove from Firestore list, update UI)
    alert(`User ${userId} unblocked (mock).`);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {MOCK_BLOCKED_USERS.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="shield-checkmark-outline" size={60} color="#BDBDBD" />
          <Text style={styles.emptyText}>No Blocked Users</Text>
          <Text style={styles.emptySubText}>You haven't blocked anyone yet.</Text>
        </View>
      ) : (
        <FlatList
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
        />
      )}
    </SafeAreaView>
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