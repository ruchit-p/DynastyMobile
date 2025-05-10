import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useNavigation, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../../components/ui/AppHeader'; // Assuming AppHeader path
import Colors from '../../constants/Colors'; // Assuming Colors path
import Fonts from '../../constants/Fonts'; // Assuming Fonts path (if you have one)
import Layout from '../../constants/Layout'; // Assuming Layout path for spacing

// Mock Data Interfaces (adjust as needed)
interface MemberProfile {
  id: string;
  name: string;
  profilePictureUrl?: string;
  // Add other profile details as needed
}

interface StoryItem {
  id: string;
  title: string;
  excerpt: string;
  imageUrl?: string;
  createdAt: Date;
}

interface EventItem {
  id: string;
  title: string;
  date: Date;
  location: string;
  description?: string;
}

// Mock Data
const MOCK_PROFILE: MemberProfile = {
  id: '123',
  name: 'Alex Doe',
  profilePictureUrl: 'https://via.placeholder.com/150/0000FF/808080?Text=User+Photo', // Replace with a real placeholder or logic
};

const MOCK_STORIES: StoryItem[] = [
  { id: 's1', title: 'Our Summer Vacation', excerpt: 'A wonderful trip to the mountains...', createdAt: new Date(2023, 7, 15), imageUrl: 'https://via.placeholder.com/300/CCCCCC/808080?Text=Story+Image+1' },
  { id: 's2', title: 'Graduation Day', excerpt: 'Celebrating a major milestone...', createdAt: new Date(2023, 5, 20), imageUrl: 'https://via.placeholder.com/300/AAAAAA/808080?Text=Story+Image+2' },
];

const MOCK_EVENTS: EventItem[] = [
  { id: 'e1', title: 'Family Reunion', date: new Date(2024, 11, 20), location: 'Community Hall' },
  { id: 'e2', title: 'Birthday Party', date: new Date(2024, 8, 5), location: 'Home' },
];

type ActiveTab = 'stories' | 'events';

const MemberProfileScreen = () => {
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ userId?: string; memberName?: string }>(); // Get userId and potentially pre-fetched name

  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('stories');
  const [isLoading, setIsLoading] = useState(true);

  const memberNameForHeader = params.memberName || profile?.name || 'Profile';

  useEffect(() => {
    // TODO: Replace with actual data fetching based on params.userId
    // Simulate fetching data
    setTimeout(() => {
      setProfile(MOCK_PROFILE);
      setStories(MOCK_STORIES);
      setEvents(MOCK_EVENTS);
      setIsLoading(false);
    }, 1000);
  }, [params.userId]);

  const renderContent = () => {
    if (isLoading) {
      return <ActivityIndicator size="large" color={Colors.light.tint} style={styles.loader} />;
    }

    if (activeTab === 'stories') {
      if (stories.length === 0) {
        return <Text style={styles.emptyStateText}>No stories shared yet.</Text>;
      }
      return stories.map(story => (
        <TouchableOpacity key={story.id} style={styles.contentItem} onPress={() => console.log('Navigate to story', story.id)}>
          {story.imageUrl && <Image source={{ uri: story.imageUrl }} style={styles.itemImage} />}
          <View style={styles.itemTextContainer}>
            <Text style={styles.itemTitle}>{story.title}</Text>
            <Text style={styles.itemSubtitle}>{story.excerpt}</Text>
            <Text style={styles.itemDate}>{story.createdAt.toLocaleDateString()}</Text>
          </View>
        </TouchableOpacity>
      ));
    }

    if (activeTab === 'events') {
      if (events.length === 0) {
        return <Text style={styles.emptyStateText}>No upcoming events.</Text>;
      }
      return events.map(event => (
        <TouchableOpacity key={event.id} style={styles.contentItem} onPress={() => console.log('Navigate to event', event.id)}>
          <View style={styles.itemTextContainer}>
            <Text style={styles.itemTitle}>{event.title}</Text>
            <Text style={styles.itemSubtitle}>{event.location}</Text>
            <Text style={styles.itemDate}>{event.date.toLocaleDateString()}</Text>
          </View>
        </TouchableOpacity>
      ));
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader
        title={memberNameForHeader}
        showBackButton={true}
        onBackPress={() => navigation.goBack()}
      />
      <ScrollView style={styles.container}>
        <View style={styles.profileHeader}>
          <Image
            source={{ uri: profile?.profilePictureUrl || 'https://via.placeholder.com/150/CCCCCC/808080?Text=User+Photo' }}
            style={styles.profilePic}
          />
          <Text style={styles.profileName}>{profile?.name || 'Loading...'}</Text>
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'stories' && styles.activeTabButton]}
            onPress={() => setActiveTab('stories')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'stories' && styles.activeTabButtonText]}>Stories</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'events' && styles.activeTabButton]}
            onPress={() => setActiveTab('events')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'events' && styles.activeTabButtonText]}>Events</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.contentContainer}>
          {renderContent()}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.background, // Use theme color
  },
  container: {
    flex: 1,
  },
  loader: {
    marginTop: 50,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: Layout.spacing.large, // Use theme spacing
    backgroundColor: Colors.light.cardBackground, // Use theme color
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.separator,
  },
  profilePic: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: Layout.spacing.medium,
    borderWidth: 3,
    borderColor: Colors.light.primary, // Use theme color
  },
  profileName: {
    fontSize: Fonts.size.h2, // Use theme font size
    fontWeight: Fonts.weight.bold, // Use theme font weight
    color: Colors.light.text,
  },
  tabContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: Colors.light.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.separator,
    paddingVertical: Layout.spacing.small,
  },
  tabButton: {
    paddingVertical: Layout.spacing.medium,
    paddingHorizontal: Layout.spacing.large,
    borderRadius: Layout.borderRadius.medium,
  },
  activeTabButton: {
    borderBottomWidth: 3,
    borderBottomColor: Colors.light.tint, // Active tab indicator
  },
  tabButtonText: {
    fontSize: Fonts.size.medium,
    fontWeight: Fonts.weight.medium,
    color: Colors.light.textSecondary,
  },
  activeTabButtonText: {
    color: Colors.light.tint,
    fontWeight: Fonts.weight.bold,
  },
  contentContainer: {
    padding: Layout.spacing.medium,
  },
  contentItem: {
    backgroundColor: Colors.light.cardBackground,
    borderRadius: Layout.borderRadius.medium,
    padding: Layout.spacing.medium,
    marginBottom: Layout.spacing.medium,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    flexDirection: 'row', // For image and text side by side
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: Layout.borderRadius.small,
    marginRight: Layout.spacing.medium,
  },
  itemTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: Fonts.size.large,
    fontWeight: Fonts.weight.bold,
    color: Colors.light.text,
    marginBottom: Layout.spacing.small / 2,
  },
  itemSubtitle: {
    fontSize: Fonts.size.medium,
    color: Colors.light.textSecondary,
    marginBottom: Layout.spacing.small / 2,
  },
  itemDate: {
    fontSize: Fonts.size.small,
    color: Colors.light.textMuted,
  },
  emptyStateText: {
    textAlign: 'center',
    marginTop: Layout.spacing.large,
    fontSize: Fonts.size.medium,
    color: Colors.light.textSecondary,
  },
});

export default MemberProfileScreen; 