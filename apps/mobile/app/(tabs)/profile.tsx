import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
// import { auth, db } from '../../src/lib/firebase'; // Commented out Firebase
import { useAuth } from '../../src/contexts/AuthContext';

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
  profilePicture?: string | null | undefined;
  firstName?: string;
  lastName?: string;
  createdAt?: any;
}

const ProfileScreen = () => {
  const router = useRouter();
  const { user, isLoading: authIsLoading, firestoreUser } = useAuth();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [userProfileData, setUserProfileData] = useState<UserProfile | null>(null);
  
  // Get theme colors
  const borderColor = useBorderColor();
  const secondaryTextColor = useTextColor('secondary');
  const tertiaryTextColor = useTextColor('tertiary');

  useEffect(() => {
    setIsLoading(authIsLoading);
    if (user) {
      // Building user profile data from auth context
      const profile: UserProfile = {
        name: user.displayName || `${firestoreUser?.firstName || ''} ${firestoreUser?.lastName || ''}`.trim() || 'User',
        email: user.email || 'No email',
        phoneNumber: user.phoneNumber || firestoreUser?.phoneNumber,
        bio: firestoreUser?.bio,
        joinDate: user.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleString('default', { month: 'long', year: 'numeric' }) : 'N/A',
        connections: firestoreUser?.connectionsCount || 0,
        stories: firestoreUser?.storiesCount || 0,
        profilePicture: user.photoURL || firestoreUser?.profilePictureUrl,
        firstName: firestoreUser?.firstName || user.displayName?.split(' ')[0],
        lastName: firestoreUser?.lastName || user.displayName?.split(' ').slice(1).join(' '),
        createdAt: firestoreUser?.createdAt || (user.metadata?.creationTime ? new Date(user.metadata.creationTime) : undefined),
      };
      setUserProfileData(profile);
    } else {
      setUserProfileData(null);
    }
  }, [user, firestoreUser, authIsLoading]);

  const handleEditProfile = () => {
    router.push('/(screens)/editProfile' as any);
  };

  const menuItems = [
    {
      icon: 'settings-outline' as keyof typeof Ionicons.glyphMap,
      text: 'Account Settings',
      onPress: () => router.push('/(screens)/accountSettings' as any),
    },
    {
      icon: 'book-outline' as keyof typeof Ionicons.glyphMap,
      text: 'Story Settings',
      onPress: () => router.push('/(screens)/storySettings' as any),
    },
    {
      icon: 'calendar-outline' as keyof typeof Ionicons.glyphMap,
      text: 'Events Settings',
      onPress: () => router.push('/(screens)/eventSettings' as any),
    },
    {
      icon: 'people-outline' as keyof typeof Ionicons.glyphMap,
      text: 'Family Management',
      onPress: () => router.push('/(screens)/familyManagement' as any),
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
                {userProfileData.connections || 0}
              </ThemedText>
              <ThemedText variant="caption" color="secondary" style={styles.statLabel}>
                Family Members
              </ThemedText>
            </View>
            
            <View style={[styles.statSeparator, { backgroundColor: borderColor }]} />
            
            <View style={styles.statItem}>
              <ThemedText variant="h5" style={styles.statNumber}>
                {userProfileData.stories || 0}
              </ThemedText>
              <ThemedText variant="caption" color="secondary" style={styles.statLabel}>
                Stories
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