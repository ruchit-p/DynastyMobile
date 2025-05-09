import React from 'react';
import { StyleSheet, View, Text, Image, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

// Assuming the logo is in assets/images. Adjust path if necessary.
const dynastyLogo = require('@/assets/images/dynasty.png'); 

export default function LandingScreen() {
  const router = useRouter();

  const handleGetStarted = () => {
    // Navigate to sign-in or a new auth hub screen
    // For now, let's assume a (auth) group with a sign-in screen
    router.push('/(auth)/signIn'); 
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={Platform.OS === 'ios' ? 'dark' : 'light'} />
      <View style={styles.container}>
        <Image source={dynastyLogo} style={styles.logo} resizeMode="contain" />
        
        <Text style={styles.title}>Dynasty</Text>
        <Text style={styles.subtitle}>Your Family Story</Text>
        <Text style={styles.tagline}>Connect • Discover • Celebrate</Text>

        <TouchableOpacity style={styles.getStartedButton} onPress={handleGetStarted}>
          <Text style={styles.getStartedButtonText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF', // White background for the landing page
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  logo: {
    width: 200, // Adjust size as needed
    height: 200, // Adjust size as needed
    marginBottom: 30,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#0A5C36', // Dynasty Green color (adjust if you have a specific theme color)
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#333333', // Dark gray
    marginBottom: 20,
  },
  tagline: {
    fontSize: 16,
    color: '#1A4B44', // Dynasty Dark Green for tagline (adjust as needed)
    letterSpacing: 0.5,
    marginBottom: 40,
  },
  getStartedButton: {
    backgroundColor: '#1A4B44', // Dynasty Dark Green
    paddingVertical: 15,
    paddingHorizontal: 80,
    borderRadius: 30, // Rounded button
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  getStartedButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
}); 