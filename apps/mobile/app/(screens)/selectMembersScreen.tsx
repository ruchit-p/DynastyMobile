import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { BorderRadius, Spacing } from '../../constants/Spacing';
import ThemedText from '../../components/ThemedText';
import { commonHeaderOptions } from '../../constants/headerConfig';
import { getFirebaseFunctions as firebaseFunctionsInstance, getFirebaseAuth as firebaseAuthInstance } from '../../src/lib/firebase';

interface Member {
  id: string;
  name: string;
  profilePicture?: string;
}

// Define a type for the raw member data from Firebase
interface FirebaseMember {
  id: string;
  displayName: string;
  profilePicture?: string;
  // Add any other properties returned by your function if needed for typing
  createdAt: any; // Replace 'any' with a more specific type if available (e.g., Timestamp)
  isAdmin: boolean;
  isOwner: boolean;
}

const SelectMembersScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams<{ purpose?: string; preSelected?: string }>();
  const { purpose = 'tagging' } = params; // Default to tagging if no purpose provided

  const [searchText, setSearchText] = useState('');
  const [members, setMembers] = useState<Member[]>([]); 
  const [filteredMembers, setFilteredMembers] = useState<Member[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const screenTitle = purpose === 'viewers' ? 'Select Viewers' : 'Tag People';
  const allowMultipleSelection = purpose === 'viewers' || purpose === 'tagging'; // Both can be multi-select

  // Load pre-selected members from params
  useEffect(() => {
    if (params.preSelected) {
      try {
        const ids = JSON.parse(params.preSelected);
        if (Array.isArray(ids)) {
          setSelectedMemberIds(ids);
        }
      } catch (e) {
        console.error("Failed to parse preSelected members:", e);
      }
    }
  }, [params.preSelected]);

  // Fetch family members
  useEffect(() => {
    const fetchFamilyMembers = async () => {
      setIsLoading(true);
      setError(null); // Clear previous errors
      try {
        const functionsInstance = firebaseFunctionsInstance(); // Call the getter
        const getFamilyManagementDataFn = functionsInstance.httpsCallable(
          'getFamilyManagementData'
        );
        
        console.log("Calling getFamilyManagementData Firebase function (@react-native-firebase)...");
        const result = await getFamilyManagementDataFn();
        const data = result.data as { members: FirebaseMember[] };

        const authService = firebaseAuthInstance(); // Call the getter to get the auth service
        const currentUser = authService.currentUser; // Then access currentUser
        const currentUserId = currentUser ? currentUser.uid : null;

        if (data && Array.isArray(data.members)) {
          console.log("Received members:", data.members.length);
          const transformedMembers: Member[] = data.members
            .filter(fbMember => fbMember.id !== currentUserId) // Filter out the current user
            .map(fbMember => ({
              id: fbMember.id,
              name: fbMember.displayName, // Map displayName to name
              profilePicture: fbMember.profilePicture,
            }));
          setMembers(transformedMembers);
          setFilteredMembers(transformedMembers);
        } else {
          console.error("Data from Firebase function is not in the expected format:", result.data);
          setError("Failed to load family members: Invalid data format.");
        }
      } catch (error: any) {
        console.error("Error fetching family members:", error);
        // Check if the error is from Firebase and has a code property
        if (error.code && error.message) {
          // Handle specific Firebase error codes if necessary
          if (error.code === 'functions/unauthenticated') {
            setError("Authentication error. Please sign in again.");
          } else if (error.code === 'functions/unavailable') {
             setError("The service is temporarily unavailable. Please try again later.");
          } else {
            setError(`Error: ${error.message} (Code: ${error.code})`);
          }
        } else {
          setError(error.message || "Failed to load family members. Please try again.");
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchFamilyMembers();
  }, []);

  // Filter members based on search text
  useEffect(() => {
    if (searchText.trim() === '') {
      setFilteredMembers(members);
    } else {
      setFilteredMembers(
        members.filter(member =>
          member.name.toLowerCase().includes(searchText.toLowerCase())
        )
      );
    }
  }, [searchText, members]);

  const toggleSelection = (memberId: string) => {
    setSelectedMemberIds(prevSelected => {
      if (prevSelected.includes(memberId)) {
        return prevSelected.filter(id => id !== memberId);
      } else {
        return allowMultipleSelection ? [...prevSelected, memberId] : [memberId];
      }
    });
  };

  const handleDone = () => {
    console.log(`Selected for ${purpose}:`, selectedMemberIds);
    
    if (router.canGoBack()) {
        router.navigate({ 
            pathname: "..", // Go back to the previous screen in the stack
            params: { returnedPurpose: purpose, selectedIds: JSON.stringify(selectedMemberIds) }
        });
    }
  };

  const renderItem = ({ item }: { item: Member }) => {
    const isSelected = selectedMemberIds.includes(item.id);
    return (
      <TouchableOpacity
        style={styles.memberItem}
        onPress={() => toggleSelection(item.id)}
      >
        <ThemedText variant="bodyMedium" style={styles.memberName}>{item.name}</ThemedText>
        <View style={styles.radioButton}>
          {isSelected && <View style={styles.radioButtonSelected} />}
        </View>
      </TouchableOpacity>
    );
  };

  // Create header options by merging common options with screen-specific ones
  const headerOptions = {
    ...commonHeaderOptions,
    title: screenTitle,
    headerLeft: () => (
      <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: Platform.OS === 'ios' ? 15 : 10, padding: 5 }}>
        <Ionicons name="chevron-back" size={28} color={Colors.palette.neutral.dark} />
      </TouchableOpacity>
    ),
    headerRight: () => (
      <TouchableOpacity onPress={handleDone} style={{ marginRight: 15 }}>
        <Text style={styles.doneButtonText}>Done</Text>
      </TouchableOpacity>
    ),
    headerStyle: {
      ...commonHeaderOptions.headerStyle,
      borderBottomWidth: 0, // Remove the bottom border
    },
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={headerOptions} />
      <View style={styles.container}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={Colors.palette.neutral.medium} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for members..."
            value={searchText}
            onChangeText={setSearchText}
            placeholderTextColor={Colors.palette.neutral.medium}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
        
        {isLoading ? (
          <View style={styles.centeredContainer}>
            <ActivityIndicator size="large" color={Colors.palette.dynastyGreen.dark} />
          </View>
        ) : error ? (
          <View style={styles.centeredContainer}>
            <ThemedText variant="bodyMedium" style={styles.errorText}>{error}</ThemedText>
          </View>
        ) : (
          <FlatList
            data={filteredMembers}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            style={styles.list}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <ThemedText variant="bodyMedium" style={styles.emptyListText}>No members found.</ThemedText>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.palette.neutral.white,
  },
  container: {
    flex: 1,
    padding: Spacing.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    backgroundColor: Colors.palette.neutral.lightest,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  searchIcon: {
    marginRight: Spacing.xs,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
    color: Colors.palette.neutral.darkest,
  },
  list: {
    flex: 1,
  },
  memberItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.palette.neutral.lighter,
  },
  memberName: {
    fontSize: 16,
    color: Colors.palette.neutral.darkest,
  },
  radioButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Colors.palette.neutral.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonSelected: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.palette.neutral.darkest,
  },
  doneButtonText: {
    color: Colors.palette.dynastyGreen.dark,
    fontSize: 17,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.xl * 2,
  },
  emptyListText: {
    textAlign: 'center',
    color: Colors.palette.neutral.medium,
    fontSize: 16,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: Colors.palette.status.error,
    textAlign: 'center',
  },
});

export default SelectMembersScreen; 