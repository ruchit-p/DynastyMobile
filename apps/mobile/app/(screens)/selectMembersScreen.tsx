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
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { BorderRadius, Spacing } from '../../constants/Spacing';

// Mock data for family members
const MOCK_MEMBERS = [
  { id: '1', name: 'Alice Smith' },
  { id: '2', name: 'Bob Johnson' },
  { id: '3', name: 'Charlie Brown' },
  { id: '4', name: 'Diana Prince' },
  { id: '5', name: 'Edward Nygma' },
  { id: '6', name: 'Fiona Gallagher' },
  { id: '7', name: 'George Costanza' },
  { id: '8', name: 'Helen Parr' },
  { id: '9', name: 'Isaac Clarke' },
  { id: '10', name: 'Julia Child' },
];

interface Member {
  id: string;
  name: string;
}

const SelectMembersScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams<{ purpose?: string; preSelected?: string }>();
  const { purpose = 'tagging' } = params; // Default to tagging if no purpose provided

  const [searchText, setSearchText] = useState('');
  const [filteredMembers, setFilteredMembers] = useState<Member[]>(MOCK_MEMBERS);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const screenTitle = purpose === 'viewers' ? 'Select Viewers' : 'Tag People';
  const allowMultipleSelection = purpose === 'viewers' || purpose === 'tagging'; // Both can be multi-select

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

  useEffect(() => {
    if (searchText.trim() === '') {
      setFilteredMembers(MOCK_MEMBERS);
    } else {
      setFilteredMembers(
        MOCK_MEMBERS.filter(member =>
          member.name.toLowerCase().includes(searchText.toLowerCase())
        )
      );
    }
  }, [searchText]);

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
    // Here you would typically pass the selectedMemberIds back to the previous screen.
    // For now, we'll just log it and go back.
    console.log(`Selected for ${purpose}:`, selectedMemberIds);
    
    if (router.canGoBack()) {
        // Pass data back using router.setParams() on the PREVIOUS route.
        // This is a common pattern for returning data from a modal-like screen.
        // Note: Expo Router's setParams typically affects the current screen's params.
        // To affect the previous screen, the previous screen needs to listen for focus and check its own params,
        // which are updated by the navigation action itself if params are passed in router.back() or router.push().
        // However, a more direct way to signal back is to update the params of the *target* screen before going back,
        // which is what createStory.tsx is set up to listen for.
        // A simpler approach for Expo Router is to pass params in the router.back() call if possible or use a global state.
        // Given createStory.tsx uses useLocalSearchParams and a focus listener, we ensure these params are set
        // for it to pick up.
        
        // The router.push on createStory to get here *creates* the route in the stack.
        // When we go back, createStory's useLocalSearchParams will be re-evaluated.
        // We need to ensure the params are available on that route instance.
        // For Expo Router, when you `router.back()`, it pops the current screen.
        // If you want to pass data to the screen you're returning to, you often pass it
        // when initially navigating *to* that screen (if it's a new instance) or by updating its params if it's already in the stack.
        // The current setup in createStory.tsx (listening on focus and checking useLocalSearchParams)
        // implies that params are expected to be on its own route object when it becomes focused.

        // A common pattern is to use navigate with merge: true or pass params with push/replace
        // on the *previous* screen's route. Since we are just going back, we rely on the listener
        // on createStory.tsx correctly picking up params that would be set on its route.
        // Let's try to use router.navigate on the *previous* screen's path with new params.
        // This is more explicit for setting params on a specific route in the stack.

        // Simpler method: Expo Router's `navigate` can take parameters that will be merged into the target route's params.
        // If createStory is the direct previous screen: 
        // router.navigate('..', { returnedPurpose: purpose, selectedIds: JSON.stringify(selectedMemberIds) });
        // Or, if it's a specific path:
        // router.replace({ pathname: '/(screens)/createStory', params: { returnedPurpose: purpose, selectedIds: JSON.stringify(selectedMemberIds)} });
        // For now, let's assume router.back() will allow createStory's focus listener to pick up fresh params
        // if we ensure they are set for the createStory route. The most robust way to pass data back with router.back()
        // is often not direct. The focus listener on createStory.tsx is the key.
        // Let's ensure the createStory screen can *receive* these. It is already set up with useLocalSearchParams.
        // The issue might be that router.back() doesn't inherently carry new params to the previous screen's *existing* instance's localSearchParamas.
        // The focus listener is a good workaround.
        // Let's ensure the `params` are set in a way the parent `createStory` can see them.
        // When using `router.back()`, the params are not typically passed this way directly.
        // The `createStory.tsx` is listening on `useLocalSearchParams()` upon focus.
        // We need to update the params of the `createStory` route. 
        // This is tricky with just `router.back()`. 
        // A more standard Expo Router way for *returning a value* from a screen presented modally
        // or in a stack is to use a result callback or a navigation event with data.
        // However, given the current listener setup in `createStory` let's try router.navigate with '..' for relative back.

        router.navigate({ 
            pathname: "..", // Go back to the previous screen in the stack
            params: { returnedPurpose: purpose, selectedIds: JSON.stringify(selectedMemberIds) }
        });
        // router.back(); // router.navigate('..') handles the back navigation
    }
  };

  const renderItem = ({ item }: { item: Member }) => {
    const isSelected = selectedMemberIds.includes(item.id);
    return (
      <TouchableOpacity
        style={styles.memberItem}
        onPress={() => toggleSelection(item.id)}
      >
        <Text style={styles.memberName}>{item.name}</Text>
        <Ionicons
          name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
          color={isSelected ? Colors.palette.dynastyGreen.medium : Colors.palette.neutral.dark}
        />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen
        options={{
          title: screenTitle,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: Platform.OS === 'ios' ? 15 : 10, padding: 5 }}>
              <Ionicons name="close" size={28} color={Colors.palette.neutral.dark} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={handleDone} style={{ marginRight: 15 }}>
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          ),
          headerTitleAlign: 'center',
          headerStyle: { backgroundColor: Colors.palette.neutral.light },
          headerTintColor: Colors.palette.neutral.dark,
          headerTitleStyle: { fontWeight: '600', fontSize: 18 },
        }}
      />
      <View style={styles.container}>
        <TextInput
          style={styles.searchInput}
          placeholder={`Search for members...`}
          value={searchText}
          onChangeText={setSearchText}
          placeholderTextColor={Colors.palette.neutral.dark}
        />
        <FlatList
          data={filteredMembers}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          style={styles.list}
          ListEmptyComponent={<Text style={styles.emptyListText}>No members found.</Text>}
        />
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
  searchInput: {
    height: 45,
    borderColor: Colors.palette.neutral.dark,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    fontSize: 16,
    backgroundColor: Colors.palette.neutral.white,
  },
  list: {
    flex: 1,
  },
  memberItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.palette.neutral.dark,
    backgroundColor: Colors.palette.neutral.white,
    borderRadius: BorderRadius.xs,
    marginBottom: Spacing.xs,
  },
  memberName: {
    fontSize: 16,
    color: Colors.palette.neutral.dark,
  },
  doneButtonText: {
    color: Colors.palette.dynastyGreen.dark, // Dynasty Green for done
    fontSize: 17,
    fontWeight: '600',
  },
  emptyListText: {
    textAlign: 'center',
    marginTop: Spacing.xl,
    color: Colors.palette.neutral.dark,
    fontSize: 16,
  },
});

export default SelectMembersScreen; 