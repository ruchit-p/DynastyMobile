import React from 'react';
import { StyleSheet, View, Text, Image, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

// Import design system constants
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { Spacing, BorderRadius, Shadows } from '../constants/Spacing';

// Image imports
const dynastyLogo = require('../assets/images/dynasty.png'); 

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
    backgroundColor: Colors.light.background.primary,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  logo: {
    width: 200,
    height: 200,
    marginBottom: Spacing['2xl'],
  },
  title: {
    fontFamily: Typography.styles.heading1.fontFamily,
    fontSize: Typography.styles.heading1.fontSize,
    lineHeight: Typography.styles.heading1.lineHeight,
    fontWeight: Typography.styles.heading1.fontWeight,
    color: Colors.dynastyGreen,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontFamily: Typography.styles.bodyLarge.fontFamily,
    fontSize: Typography.styles.bodyLarge.fontSize,
    lineHeight: Typography.styles.bodyLarge.lineHeight,
    fontWeight: Typography.styles.bodyLarge.fontWeight,
    color: Colors.light.text.secondary,
    marginBottom: Spacing.lg,
  },
  tagline: {
    fontFamily: Typography.styles.bodyMedium.fontFamily,
    fontSize: Typography.styles.bodyMedium.fontSize,
    lineHeight: Typography.styles.bodyMedium.lineHeight,
    fontWeight: Typography.styles.bodyMedium.fontWeight,
    color: Colors.dynastyGreen,
    letterSpacing: 0.5,
    marginBottom: Spacing['3xl'],
  },
  getStartedButton: {
    backgroundColor: Colors.dynastyGreen,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing['5xl'],
    borderRadius: BorderRadius['2xl'],
    shadowColor: Shadows.md.shadowColor,
    shadowOffset: Shadows.md.shadowOffset,
    shadowOpacity: Shadows.md.shadowOpacity,
    shadowRadius: Shadows.md.shadowRadius,
    elevation: Shadows.md.elevation,
  },
  getStartedButtonText: {
    fontFamily: Typography.styles.button.fontFamily,
    fontSize: Typography.styles.button.fontSize,
    lineHeight: Typography.styles.button.lineHeight,
    fontWeight: Typography.styles.button.fontWeight,
    color: Colors.light.text.inverse,
  },
}); 