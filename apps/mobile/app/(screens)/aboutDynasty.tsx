import React, { useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Image, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { commonHeaderOptions } from '../../constants/headerConfig';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';

const APP_NAME = "Dynasty - The Family Social Media App";
const APP_VERSION = "1.0.0";
const COPYRIGHT_YEAR = new Date().getFullYear();

const AboutDynastyScreen = () => {
  const navigation = useNavigation();
  const router = useRouter();
  const { handleError, withErrorHandling, reset } = useErrorHandler({
    severity: ErrorSeverity.INFO,
    title: 'About Dynasty Error',
    trackCurrentScreen: true,
  });

  useEffect(() => {
    try {
      navigation.setOptions({
        ...commonHeaderOptions,
        title: 'About Dynasty',
      });
    } catch (error) {
      handleError(error, { 
        component: 'AboutDynastyScreen',
        action: 'setNavigationOptions'
      });
    }
  }, [navigation, handleError]);

  // Reset error state when component mounts
  useEffect(() => {
    reset();
  }, [reset]);

  const openLink = withErrorHandling(async (url: string) => {
    try {
      if (url === 'terms') {
        router.push('/(screens)/termsOfService');
      } else if (url === 'privacy') {
        router.push('/(screens)/privacyPolicy');
      } else {
        throw new Error(`Invalid URL parameter: ${url}`);
      }
    } catch (error) {
      handleError(error, {
        component: 'AboutDynastyScreen',
        action: 'openLink',
        url,
      });
      throw error; // Re-throw to let withErrorHandling handle it
    }
  });

  return (
    <ErrorBoundary screenName="AboutDynastyScreen">
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.container}>
          <Image 
            style={styles.appIcon} 
          />
          <Text style={styles.appName}>{APP_NAME}</Text>
          <Text style={styles.appVersion}>Version {APP_VERSION}</Text>
          
          <Text style={styles.description}>
            Dynasty is a unique social platform designed to help families connect, share memories, and preserve their heritage for generations to come.
          </Text>

          <View style={styles.linksSection}>
              <TouchableOpacity style={styles.linkItem} onPress={() => openLink('terms')}>
                  <Ionicons name="document-text-outline" size={22} color="#007AFF" style={styles.linkIcon} />
                  <Text style={styles.linkText}>Terms of Service</Text>
                  <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
              </TouchableOpacity>
              <View style={styles.separator} />
              <TouchableOpacity style={styles.linkItem} onPress={() => openLink('privacy')}>
                  <Ionicons name="shield-checkmark-outline" size={22} color="#007AFF" style={styles.linkIcon} />
                  <Text style={styles.linkText}>Privacy Policy</Text>
                  <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
              </TouchableOpacity>
          </View>

          <Text style={styles.copyright}>
            © {COPYRIGHT_YEAR} Dynasty Inc. All rights reserved.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8F8F8',
  },
  container: {
    alignItems: 'center',
    padding: 20,
  },
  appIcon: {
    width: 100,
    height: 100,
    borderRadius: 18,
    marginBottom: 20,
    backgroundColor: '#E0E0E0',
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 5,
  },
  appVersion: {
    fontSize: 16,
    color: '#666',
    marginBottom: 25,
  },
  description: {
    fontSize: 15,
    color: '#444',
    textAlign: 'center',
    marginBottom: 30,
    paddingHorizontal: 15,
  },
  linksSection: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginBottom: 30,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DCDCDC',
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 15,
  },
  linkIcon: {
    marginRight: 15,
  },
  linkText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#DCDCDC',
    marginLeft: 15 + 22 + 15,
  },
  copyright: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginTop: 20,
  },
  placeholderText: {
  },
  placeholderSubText: {
  },
});

export default AboutDynastyScreen; 