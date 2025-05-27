import React, { useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useNavigation } from 'expo-router';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';

const TermsOfServiceScreen = () => {
  const navigation = useNavigation();
  const { handleError, withErrorHandling: _withErrorHandling, reset } = useErrorHandler({
    severity: ErrorSeverity.INFO,
    title: 'Terms of Service Error',
    trackCurrentScreen: true,
  });

  useEffect(() => {
    try {
      navigation.setOptions({
        title: 'Terms of Service',
        headerStyle: { backgroundColor: Colors.light.background.primary },
        headerTintColor: Colors.light.text.primary,
        headerTitleStyle: { fontWeight: '600' },
        headerBackTitleVisible: false,
      });
    } catch (error) {
      handleError(error, { 
        component: 'TermsOfServiceScreen',
        action: 'setNavigationOptions'
      });
    }
  }, [navigation, handleError]);

  useEffect(() => {
    reset();
  }, [reset]);

  return (
    <ErrorBoundary screenName="TermsOfServiceScreen">
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          
          <View style={styles.header}>
            <Text style={styles.title}>Terms of Service</Text>
            <Text style={styles.dateText}>Effective Date: [Insert Date]</Text>
            <Text style={styles.dateText}>Last Updated: [Insert Date]</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. ACCEPTANCE OF TERMS</Text>
            <Text style={styles.bodyText}>
              By using Dynasty, you agree to be bound by these Terms of Service. Dynasty is operated by [Company Name] and these Terms constitute a legally binding agreement between you and the Company.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. SERVICE DESCRIPTION</Text>
            <Text style={styles.bodyText}>Dynasty is a family-focused social media platform that enables:</Text>
            <Text style={styles.bulletPoint}>• Family Tree Management with invitation-based connections</Text>
            <Text style={styles.bulletPoint}>• History Book for multimedia family stories</Text>
            <Text style={styles.bulletPoint}>• Event Management with RSVP tracking</Text>
            <Text style={styles.bulletPoint}>• Secure Vault Storage for family media</Text>
            <Text style={styles.bulletPoint}>• End-to-End Encrypted Messaging</Text>
            <Text style={styles.bulletPoint}>• Family Feed for stories and events</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. ELIGIBILITY</Text>
            <Text style={styles.bodyText}>
              • Users must be at least 13 years old{'\n'}
              • Users under 18 must have parental consent{'\n'}
              • You must provide accurate registration information{'\n'}
              • Family tree connections should be accurate
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>4. PRIVACY & ENCRYPTION</Text>
            <Text style={styles.bodyText}>
              Your privacy is our highest priority. Dynasty implements end-to-end encryption for messages and secure vault storage. See our Privacy Policy for complete details.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>5. SUBSCRIPTION TIERS</Text>
            <Text style={styles.bodyText}>
              <Text style={styles.boldText}>Free Tier:</Text> Basic family tree (25 members), 5GB vault storage{'\n\n'}
              <Text style={styles.boldText}>Premium:</Text> Unlimited members, 1TB storage, advanced features
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>6. PROHIBITED USES</Text>
            <Text style={styles.bodyText}>
              You may not violate laws, impersonate others, interfere with the app&apos;s functionality, or engage in unauthorized commercial activities.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>7. LIABILITY LIMITATION</Text>
            <Text style={styles.bodyText}>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT PAID BY YOU FOR THE SERVICE IN THE 12 MONTHS PRECEDING THE CLAIM.
            </Text>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              By using Dynasty, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
            </Text>
          </View>

        </ScrollView>
      </SafeAreaView>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.background.primary,
  },
  container: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.background.secondary,
  },
  title: {
    ...Typography.styles.heading1,
    color: Colors.light.text.primary,
    textAlign: 'center',
    marginBottom: 10,
  },
  dateText: {
    ...Typography.styles.caption,
    color: Colors.light.text.secondary,
    textAlign: 'center',
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    ...Typography.styles.heading3,
    color: Colors.light.text.primary,
    marginBottom: 10,
  },
  bodyText: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.secondary,
    lineHeight: 22,
  },
  bulletPoint: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.secondary,
    lineHeight: 22,
    marginLeft: 10,
    marginBottom: 5,
  },
  boldText: {
    fontWeight: '600',
  },
  footer: {
    marginTop: 20,
    padding: 20,
    backgroundColor: Colors.light.background.secondary,
    borderRadius: 10,
    alignItems: 'center',
  },
  footerText: {
    ...Typography.styles.bodySmall,
    color: Colors.light.text.secondary,
    textAlign: 'center',
    fontWeight: '500',
  },
});

export default TermsOfServiceScreen;
