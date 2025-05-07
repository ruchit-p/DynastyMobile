import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Switch, ScrollView, Alert } from 'react-native';
import { useNavigation } from 'expo-router';
import { auth, db } from '../../src/lib/firebase';
import { doc, setDoc, getDoc } from "firebase/firestore";

interface NotificationToggleProps {
    label: string;
    description: string;
    isEnabled: boolean;
    onToggle: (value: boolean) => void;
}

const NotificationToggle: React.FC<NotificationToggleProps> = ({ label, description, isEnabled, onToggle }) => {
    return (
        <View style={styles.toggleContainer}>
            <View style={styles.textContainer}>
                <Text style={styles.toggleLabel}>{label}</Text>
                <Text style={styles.toggleDescription}>{description}</Text>
            </View>
            <Switch
                trackColor={{ false: "#767577", true: "#81b0ff" }} // Example colors
                thumbColor={isEnabled ? "#007AFF" : "#f4f3f4"}
                ios_backgroundColor="#E0E0E0"
                onValueChange={onToggle}
                value={isEnabled}
            />
        </View>
    );
}

const NotificationPreferencesScreen = () => {
  const navigation = useNavigation();
  
  const initialPrefs = {
    newStory: true,
    storyComment: true,
    eventInvite: true,
    eventUpdate: false,
    familyRequest: true,
  };

  const [prefs, setPrefs] = useState(initialPrefs);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPreferences = async () => {
      if (auth.currentUser) {
        const userDocRef = doc(db, "users", auth.currentUser.uid);
        try {
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists() && docSnap.data().notificationPreferences) {
            setPrefs(docSnap.data().notificationPreferences);
          } else {
            await setDoc(userDocRef, { notificationPreferences: initialPrefs }, { merge: true });
          }
        } catch (error) {
          console.error("Error fetching notification preferences:", error);
        }
      }
      setIsLoading(false);
    };
    fetchPreferences();
  }, []);

  useEffect(() => {
    navigation.setOptions({
      title: 'Notification Preferences',
      headerStyle: { backgroundColor: '#F8F8F8' },
      headerTintColor: '#333333',
      headerTitleStyle: { fontWeight: '600' },
      headerBackTitleVisible: false,
    });
  }, [navigation]);

  const handleToggle = async (key: keyof typeof prefs) => {
    if (!auth.currentUser) {
      Alert.alert("Error", "You must be logged in to change preferences.");
      return;
    }

    const newPrefs = {
      ...prefs,
      [key]: !prefs[key],
    };
    setPrefs(newPrefs);

    try {
      const userDocRef = doc(db, "users", auth.currentUser.uid);
      await setDoc(userDocRef, { notificationPreferences: newPrefs }, { merge: true });
    } catch (error) {
      console.error("Error saving notification preferences:", error);
      Alert.alert("Save Failed", "Could not save your preferences. Please try again.");
      setPrefs(prefs);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text>Loading preferences...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <NotificationToggle 
            label="New Stories"
            description="Notify me when a new story is published by my connections."
            isEnabled={prefs.newStory}
            onToggle={() => handleToggle('newStory')}
        />
         <NotificationToggle 
            label="Story Comments"
            description="Notify me when someone comments on my stories."
            isEnabled={prefs.storyComment}
            onToggle={() => handleToggle('storyComment')}
        />
         <NotificationToggle 
            label="Event Invitations"
            description="Notify me when I receive an invitation to an event."
            isEnabled={prefs.eventInvite}
            onToggle={() => handleToggle('eventInvite')}
        />
         <NotificationToggle 
            label="Event Updates"
            description="Notify me about updates to events I'm attending."
            isEnabled={prefs.eventUpdate}
            onToggle={() => handleToggle('eventUpdate')}
        />
        <NotificationToggle 
            label="Family Requests"
            description="Notify me about new family connection requests."
            isEnabled={prefs.familyRequest}
            onToggle={() => handleToggle('familyRequest')}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F0F0',
  },
  container: {
    flex: 1,
    paddingTop: 20, // Add some padding at the top
  },
  toggleContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 15,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DCDCDC',
  },
  textContainer: {
      flex: 1, // Allow text to take up available space
      marginRight: 10,
  },
  toggleLabel: {
      fontSize: 16,
      color: '#333',
      marginBottom: 3,
  },
  toggleDescription: {
      fontSize: 13,
      color: '#777',
  },
});

export default NotificationPreferencesScreen; 