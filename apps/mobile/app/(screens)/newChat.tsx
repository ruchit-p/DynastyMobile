import React, { useState, useLayoutEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  SafeAreaView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import AppHeader from '../../components/ui/AppHeader';
import IconButton, { IconSet } from '../../components/ui/IconButton';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

// Placeholder for Colors (ideally from a central theme file)
const Colors = {
  primary: '#1A4B44',
  white: '#FFFFFF',
  lightGray: '#F0F0F0',
  gray: '#888888',
  darkGray: '#333333',
  accent: '#007AFF', // iOS blue for selection or a theme accent
  separator: '#E0E0E0',
  inputBackground: '#F5F5F5',
};

interface FamilyMember {
  id: string;
  name: string;
  avatarUrl?: string; // Optional
}

// Mock Data for family members
const MOCK_FAMILY_MEMBERS: FamilyMember[] = [
  { id: '1', name: 'Eleanor Vance' },
  { id: '2', name: 'Marcus Thorne' },
  { id: '3', name: 'Julia Chen' },
  { id: '4', name: 'Samuel Green' },
  { id: '5', name: 'Isabelle Rossi' },
  { id: '6', name: 'David Miller' },
  { id: '7', name: 'Sophia Lee' },
];

const NewChatScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<FamilyMember[]>([]);

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <AppHeader
          title="New Chat"
          headerLeft={() => (
            <IconButton
              iconName="arrow-back"
              iconSet={IconSet.Ionicons}
              size={28}
              color={Colors.primary}
              onPress={() => router.back()}
              accessibilityLabel="Go back"
            />
          )}
        />
      ),
    });
  }, [navigation, router]);

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

  const handleStartChat = () => {
    if (selectedMembers.length === 0) {
      Alert.alert("No Selection", "Please select at least one member to start a chat.");
      return;
    }

    if (selectedMembers.length === 1) {
      const member = selectedMembers[0];
      console.log(`Starting one-on-one chat with: ${member.name}`);
      // Navigate to chatDetail with single user info
      router.push({
        pathname: '/(screens)/chatDetail',
        params: { userId: member.id, userName: member.name /*, and potentially avatar */ },
      });
    } else {
      const memberNames = selectedMembers.map(m => m.name).join(', ');
      console.log(`Starting group chat with: ${memberNames}`);
      // Navigate to chatDetail with group info
      // This might involve creating a temporary group ID or passing member IDs
      const userIds = selectedMembers.map(m => m.id);
      const groupName = selectedMembers.map(m => m.name.split(' ')[0]).slice(0,3).join(', ') + (selectedMembers.length > 3 ? '...' : '');

      router.push({
        pathname: '/(screens)/chatDetail', // Assuming chatDetail can handle group chats
        params: {
          isGroupChat: true, // Add a flag
          groupName: groupName, // "User1, User2, User3..."
          participantIds: JSON.stringify(userIds), // Send as stringified JSON array
          // participantNames: JSON.stringify(selectedMembers.map(m => m.name)), // Optional
        },
      });
    }
  };

  const filteredMembers = MOCK_FAMILY_MEMBERS.filter(member =>
    member.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const renderMemberItem = ({ item }: { item: FamilyMember }) => {
    const isSelected = selectedMembers.find(m => m.id === item.id);
    return (
      <TouchableOpacity
        style={[styles.memberItem, isSelected && styles.memberItemSelected]}
        onPress={() => toggleMemberSelection(item)}
      >
        <View style={styles.avatarContainer}>
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person-outline" size={24} color={Colors.primary} />
            </View>
          )}
        </View>
        <Text style={styles.memberName}>{item.name}</Text>
        <View style={styles.checkboxContainer}>
          {isSelected ? (
            <Ionicons name="checkmark-circle" size={26} color={Colors.primary} />
          ) : (
            <Ionicons name="ellipse-outline" size={26} color={Colors.gray} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={Colors.gray} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search family members..."
          value={searchText}
          onChangeText={setSearchText}
          placeholderTextColor={Colors.gray}
        />
      </View>

      {filteredMembers.length === 0 && searchText ? (
         <View style={styles.emptyListContainer}>
            <Text style={styles.emptyListText}>No members found for "{searchText}"</Text>
         </View>
      ) : (
        <FlatList
            data={filteredMembers}
            renderItem={renderMemberItem}
            keyExtractor={item => item.id}
            style={styles.listContainer}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {selectedMembers.length > 0 && (
        <TouchableOpacity style={styles.startButton} onPress={handleStartChat}>
          <Text style={styles.startButtonText}>
            Start Chat ({selectedMembers.length})
          </Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBackground,
    borderRadius: 8,
    marginHorizontal: 15,
    marginVertical: 10,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 10 : 5,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.darkGray,
    height: Platform.OS === 'ios' ? 25: 40,
  },
  listContainer: {
    flex: 1,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: Colors.white,
  },
  memberItemSelected: {
    backgroundColor: Colors.lightGray, // A slightly different background for selected items
  },
  avatarContainer: {
    marginRight: 15,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberName: {
    flex: 1,
    fontSize: 16,
    color: Colors.darkGray,
  },
  checkboxContainer: {
    marginLeft: 15,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.separator,
    marginLeft: 75, // Align with text, offset by avatar + margin
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyListText: {
    fontSize: 16,
    color: Colors.gray,
  },
  startButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 20,
    borderRadius: 8,
  },
  startButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default NewChatScreen; 