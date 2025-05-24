import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFirebaseDb } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import ErrorBoundary from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';

// Import design system components
import Screen from '../../components/ui/Screen';
import ThemedText from '../../components/ThemedText';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';
import ListItem from '../../components/ListItem';

// Import design tokens
import { Spacing } from '../../constants/Spacing';
import { useTextColor, useBorderColor } from '../../hooks/useThemeColor';

interface UserProfile {
  name: string;
  email: string;
  phoneNumber?: string;
  bio?: string;
  joinDate?: string;
  connections?: number;
  stories?: number;
  events?: number;
  profilePicture?: string | null | undefined;
  firstName?: string;
  lastName?: string;
  createdAt?: any;
}

interface ProfileStats {
  storiesCount: number;
  eventsCount: number;
  connectionsCount: number;
}

const ProfileScreen = () => {
  const router = useRouter();
  const { user, isLoading: authIsLoading, firestoreUser } = useAuth();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [userProfileData, setUserProfileData] = useState<UserProfile | null>(null);
  const [profileStats, setProfileStats] = useState<ProfileStats>({
    storiesCount: 0,
    eventsCount: 0,
    connectionsCount: 0
  });
  
  // Get theme colors
  const borderColor = useBorderColor();
  const secondaryTextColor = useTextColor('secondary');
  const tertiaryTextColor = useTextColor('tertiary');

  // Initialize our error handler
  const { handleError, withErrorHandling } = useErrorHandler({
    title: 'Profile Error',
  });

  // Fetch dynamic stats from Firebase
  const fetchProfileStats = async (userId: string) => {
    try {
      const db = getFirebaseDb();
      
      // Fetch stories count
      const storiesQuery = db.collection('stories')
        .where('userId', '==', userId)
        .where('isDeleted', '!=', true);
      const storiesSnapshot = await storiesQuery.get();
      
      // Fetch events count (where user is host or attendee)
      const hostedEventsQuery = db.collection('events')
        .where('createdBy', '==', userId)
        .where('isDeleted', '!=', true);
      const hostedEventsSnapshot = await hostedEventsQuery.get();
      
      const attendingEventsQuery = db.collection('events')
        .where('attendees', 'array-contains', userId)
        .where('isDeleted', '!=', true);
      const attendingEventsSnapshot = await attendingEventsQuery.get();
      
      // Combine unique events (avoid counting same event twice if user is both host and attendee)
      const eventIds = new Set([
        ...hostedEventsSnapshot.docs.map(doc => doc.id),
        ...attendingEventsSnapshot.docs.map(doc => doc.id)
      ]);
      
      // Fetch connections count from user's family members
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();
      let connectionsCount = 0;
      
      if (userData?.familyId) {
        const familyDoc = await db.collection('families').doc(userData.familyId).get();
        const familyData = familyDoc.data();
        connectionsCount = familyData?.members?.length || 0;
      }
      
      setProfileStats({
        storiesCount: storiesSnapshot.size,
        eventsCount: eventIds.size,
        connectionsCount: connectionsCount - 1 // Subtract 1 to exclude the user themselves
      });
    } catch (error) {
      console.error('Error fetching profile stats:', error);
      // Don't throw error, just use default values
    }
  };

  useEffect(() => {
    const loadProfileData = async () => {
      try {
        setIsLoading(authIsLoading);
        if (user) {
          // Building user profile data from auth context
          const profile: UserProfile = {
            name: user.displayName || `${firestoreUser?.firstName || ''} ${firestoreUser?.lastName || ''}`.trim() || 'User',
            email: user.email || null,
            phoneNumber: user.phoneNumber || firestoreUser?.phoneNumber,
            bio: firestoreUser?.bio,
            joinDate: user.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleString('default', { month: 'long', year: 'numeric' }) : 'N/A',
            connections: 0, // Will be updated by fetchProfileStats
            stories: 0, // Will be updated by fetchProfileStats
            events: 0, // Will be updated by fetchProfileStats
            profilePicture: user.photoURL || firestoreUser?.profilePictureUrl,
            firstName: firestoreUser?.firstName || user.displayName?.split(' ')[0],
            lastName: firestoreUser?.lastName || user.displayName?.split(' ').slice(1).join(' '),
            createdAt: firestoreUser?.createdAt || (user.metadata?.creationTime ? new Date(user.metadata.creationTime) : undefined),
          };
          setUserProfileData(profile);
          
          // Fetch dynamic stats
          await fetchProfileStats(user.uid);
        } else {
          setUserProfileData(null);
        }
      } catch (error) {
        handleError(error, {
          severity: ErrorSeverity.ERROR,
          metadata: {
            action: 'loadUserProfile',
            userId: user?.uid
          }
        });
        setUserProfileData(null);
      }
    };
    
    loadProfileData();
  }, [user, firestoreUser, authIsLoading]);

  const handleEditProfile = withErrorHandling(() => {
    router.push('/(screens)/editProfile' as any);
  });

  const menuItems = [
    {
      icon: 'settings-outline' as keyof typeof Ionicons.glyphMap,
      text: 'Account Settings',
      onPress: withErrorHandling(() => router.push('/(screens)/accountSettings' as any)),
    },
    {
      icon: 'book-outline' as keyof typeof Ionicons.glyphMap,
      text: 'Story Settings',
      onPress: withErrorHandling(() => router.push('/(screens)/storySettings' as any)),
    },
    {
      icon: 'calendar-outline' as keyof typeof Ionicons.glyphMap,
      text: 'Events Settings',
      onPress: withErrorHandling(() => router.push('/(screens)/eventSettings' as any)),
    },
    {
      icon: 'people-outline' as keyof typeof Ionicons.glyphMap,
      text: 'Family Management',
      onPress: withErrorHandling(() => router.push('/(screens)/familyManagement' as any)),
    },
  ];

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0A5C36" />
          <ThemedText variant="bodyMedium" color="secondary" style={styles.loadingText}>
            Loading profile...
          </ThemedText>
        </View>
      </Screen>
    );
  }

  if (!userProfileData) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title="Could not load profile"
          description="There was a problem loading your profile information"
          actionLabel="Try Again"
          onAction={() => setIsLoading(true)}
        />
      </Screen>
    );
  }

  return (
    <ErrorBoundary screenName="ProfileScreen">
      <Screen scroll padding>
      <Card variant="elevated" style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <Avatar
            source={userProfileData.profilePicture || undefined}
            size="xl"
            editable
            onPress={handleEditProfile}
          />
          
          <ThemedText variant="h3" style={styles.profileName}>
            {userProfileData.name}
          </ThemedText>
          
          <ThemedText variant="bodyMedium" color="secondary" style={styles.profileEmail}>
            {userProfileData.email || userProfileData.phoneNumber}
          </ThemedText>
          
          <ThemedText variant="caption" color="tertiary" style={styles.profileJoinDate}>
            Joined {userProfileData.joinDate}
          </ThemedText>
          
          <View style={[styles.statsContainer, { borderTopColor: borderColor }]}>
            <View style={styles.statItem}>
              <ThemedText variant="h5" style={styles.statNumber}>
                {profileStats.connectionsCount}
              </ThemedText>
              <ThemedText variant="caption" color="secondary" style={styles.statLabel}>
                Family Members
              </ThemedText>
            </View>
            
            <View style={[styles.statSeparator, { backgroundColor: borderColor }]} />
            
            <View style={styles.statItem}>
              <ThemedText variant="h5" style={styles.statNumber}>
                {profileStats.storiesCount}
              </ThemedText>
              <ThemedText variant="caption" color="secondary" style={styles.statLabel}>
                Stories
              </ThemedText>
            </View>
            
            <View style={[styles.statSeparator, { backgroundColor: borderColor }]} />
            
            <View style={styles.statItem}>
              <ThemedText variant="h5" style={styles.statNumber}>
                {profileStats.eventsCount}
              </ThemedText>
              <ThemedText variant="caption" color="secondary" style={styles.statLabel}>
                Events
              </ThemedText>
            </View>
          </View>
        </View>
      </Card>

      <Card variant="outlined" noPadding style={styles.menuCard}>
        {menuItems.map((item, index) => (
          <React.Fragment key={item.text}>
            <ListItem icon={item.icon} text={item.text} onPress={item.onPress} />
            {index < menuItems.length - 1 && (
              <View style={[styles.separator, { backgroundColor: borderColor }]} />
            )}
          </React.Fragment>
        ))}
      </Card>
      
      <Button
        title="Explore Style Guide"
        onPress={() => router.push('/(screens)/StyleGuide' as any)}
        variant="text"
        leftIcon={'color-palette-outline' as keyof typeof Ionicons.glyphMap}
        style={styles.styleGuideButton}
      />
      </Screen>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.sm,
  },
  profileCard: {
    marginBottom: Spacing.md,
    paddingVertical: Spacing.lg,
  },
  profileHeader: {
    alignItems: 'center',
  },
  profileName: {
    marginTop: Spacing.md,
  },
  profileEmail: {
    marginTop: Spacing.xs,
  },
  profileJoinDate: {
    marginTop: Spacing.sm,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '80%',
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    textAlign: 'center',
  },
  statLabel: {
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  statSeparator: {
    width: 1,
    height: '70%',
    alignSelf: 'center',
  },
  menuCard: {
    marginBottom: Spacing.md,
  },
  separator: {
    height: 1,
    marginLeft: 15 + 24 + 15,
  },
  styleGuideButton: {
    alignSelf: 'center',
    marginVertical: Spacing.md,
  },
});

export default ProfileScreen;