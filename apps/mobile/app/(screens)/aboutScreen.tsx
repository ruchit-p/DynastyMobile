import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, SafeAreaView, Image, Linking, TouchableOpacity } from 'react-native';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';

// MARK: - Main Component
const AboutScreenContent = () => {
  const navigation = useNavigation();
  const appVersion = "1.0.0"; // TODO: Get this dynamically
  const buildNumber = "100123"; // TODO: Get this dynamically

  // Initialize error handler
  const { withErrorHandling, clearError } = useErrorHandler({
    severity: ErrorSeverity.INFO,
    title: 'About Screen Error',
    trackCurrentScreen: true
  });

  // Reset error state when component mounts
  useEffect(() => {
    clearError();
  }, [clearError]);

  useEffect(() => {
    const setNavigationOptions = withErrorHandling(async () => {
      navigation.setOptions({
        title: 'About Dynasty',
        headerTitleAlign: 'center',
        headerLeft: () => (
          <Ionicons 
            name="arrow-back" 
            size={24} 
            color={Platform.OS === 'ios' ? "#007AFF" : "#000"}
            style={{ marginLeft: 15 }} 
            onPress={() => navigation.goBack()}
          />
        ),
      });
    }, { component: 'AboutScreen', action: 'setNavigationOptions' });

    setNavigationOptions();
  }, [navigation, withErrorHandling]);

  const openLink = withErrorHandling(async (url: string) => {
    await Linking.openURL(url);
  }, { component: 'AboutScreen', action: 'openLink' });

  // MARK: - Render
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Image 
          source={require('../../assets/images/icon.png')} // Assuming you have an app icon here
          style={styles.appIcon} 
        />
        <Text style={styles.appName}>Dynasty</Text>
        <Text style={styles.appSubtitle}>The Family Social Media App</Text>
        
        <View style={styles.infoSection}>
          <Text style={styles.infoText}>Version: {appVersion} (Build {buildNumber})</Text>
          <Text style={styles.infoText}>© {new Date().getFullYear()} Dynasty Inc. All rights reserved.</Text>
        </View>

        <View style={styles.linksSection}>
            <TouchableOpacity 
              style={styles.linkItem} 
              onPress={() => openLink('https://example.com/terms')}
            >
                <Ionicons name="document-text-outline" size={20} color="#007AFF" />
                <Text style={styles.linkText}>Terms of Service</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.linkItem} 
              onPress={() => openLink('https://example.com/privacy')}
            >
                <Ionicons name="shield-checkmark-outline" size={20} color="#007AFF" />
                <Text style={styles.linkText}>Privacy Policy</Text>
            </TouchableOpacity>
             <TouchableOpacity 
               style={styles.linkItem} 
               onPress={() => openLink('https://example.com/website')}
             >
                <Ionicons name="globe-outline" size={20} color="#007AFF" />
                <Text style={styles.linkText}>Visit our Website</Text>
            </TouchableOpacity>
        </View>

        <Text style={styles.description}>
          Dynasty is a unique social platform designed to help families connect, share memories, and preserve their heritage for generations to come.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

// MARK: - Styles
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    padding: 20,
  },
  appIcon: {
    width: 100,
    height: 100,
    borderRadius: 20,
    marginBottom: 15,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A4B44', // Theme color
    marginBottom: 5,
  },
  appSubtitle: {
    fontSize: 16,
    color: '#555',
    marginBottom: 25,
  },
  infoSection: {
    alignItems: 'center',
    marginBottom: 25,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E0E0E0',
    width: '100%',
  },
  infoText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 5,
  },
  linksSection: {
    width: '100%',
    marginBottom: 25,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  linkText: {
    fontSize: 16,
    color: '#007AFF',
    marginLeft: 10,
  },
  description: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 10,
  }
});

// MARK: - Wrapped Component with Error Boundary
const AboutScreen = () => {
  return (
    <ErrorBoundary screenName="AboutScreen">
      <AboutScreenContent />
    </ErrorBoundary>
  );
};

export default AboutScreen; 