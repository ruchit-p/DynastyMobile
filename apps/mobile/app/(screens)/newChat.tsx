import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useNavigation } from 'expo-router';

interface User {
  id: string;
  name: string;
  avatarUrl: string;
  username?: string; // Optional username/handle
}

// Mock user data for searching
const mockUsers: User[] = [
  {
    id: 'user1',
    name: 'Charlie Brown',
    avatarUrl: 'https://via.placeholder.com/40/FFFFE0/000000?Text=C',
    username: 'goodgrief',
  },
  {
    id: 'user2',
    name: 'Diana Prince',
    avatarUrl: 'https://via.placeholder.com/40/FFC0CB/000000?Text=D',
    username: 'wonderwoman',
  },
  {
    id: 'user3',
    name: 'Sarah Connor',
    avatarUrl: 'https://via.placeholder.com/40/D3D3D3/000000?Text=S',
    username: 'terminator_mom',
  },
  {
    id: 'user4',
    name: 'Peter Parker',
    avatarUrl: 'https://via.placeholder.com/40/FF0000/FFFFFF?Text=P',
    username: 'spidey',
  },
];

const NewChatScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [filteredUsers, setFilteredUsers] = useState<User[]>(mockUsers);

  useEffect(() => {
    navigation.setOptions({
      title: 'New Message',
      headerLeft: () => (
        <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: Platform.OS === 'ios' ? 15: 10 }}>
          <Ionicons name="close-outline" size={30} color="#1A4B44" />
        </TouchableOpacity>
      ),
      headerTitleAlign: 'center',
    });
  }, [navigation, router]);

  useEffect(() => {
    if (searchText.trim() === '') {
      setFilteredUsers(mockUsers); // Show all users or recent contacts, etc.
    } else {
      setFilteredUsers(
        mockUsers.filter(user => 
          user.name.toLowerCase().includes(searchText.toLowerCase()) ||
          (user.username && user.username.toLowerCase().includes(searchText.toLowerCase()))
        )
      );
    }
  }, [searchText]);

  const handleUserSelect = (user: User) => {
    // TODO: Check if a chat with this user already exists. If so, navigate to it.
    // Otherwise, navigate to chatDetail with params to indicate it's a new chat to be created, or create it first.
    Alert.alert("Start Chat", `Start a new chat with ${user.name}?`, [
        { text: "Cancel" },
        { text: "Start", onPress: () => router.replace({ pathname: '/(screens)/chatDetail', params: { chatId: `new_${user.id}`, userName: user.name } }) }
    ]);
  };

  const renderUserItem = ({ item }: { item: User }) => (
    <TouchableOpacity style={styles.userItem} onPress={() => handleUserSelect(item)}>
      <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.name}</Text>
        {item.username && <Text style={styles.userHandle}>@{item.username}</Text>}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search for people..."
          value={searchText}
          onChangeText={setSearchText}
          autoFocus
          placeholderTextColor="#888"
        />
      </View>
      {filteredUsers.length > 0 ? (
        <FlatList
            data={filteredUsers}
            renderItem={renderUserItem}
            keyExtractor={(item) => item.id}
            style={styles.listContainer}
        />
      ) : (
        <View style={styles.emptyResultsContainer}>
            <Text style={styles.emptyResultsText}>No users found for "{searchText}"</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    marginHorizontal: 15,
    marginTop: 10, 
    marginBottom: 5,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 10 : 5,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    height: Platform.OS === 'ios' ? 25 : 40,
  },
  listContainer: { flex: 1 },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '500', color: '#333' },
  userHandle: { fontSize: 13, color: '#777', marginTop: 2 },
  emptyResultsContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
  },
  emptyResultsText: {
      fontSize: 16,
      color: '#777',
  }
});

export default NewChatScreen; 