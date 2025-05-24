import React, { useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useNavigation } from 'expo-router';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { Colors } from '../../constants/Colors';
import Typography from '../../constants/Typography';

const PrivacyPolicyScreen = () => {
  const navigation = useNavigation();
  const { handleError, withErrorHandling, reset } = useErrorHandler({
    severity: ErrorSeverity.INFO,
    title: 'Privacy Policy Error',
    trackCurrentScreen: true,
  });

  useEffect(() => {
    try {
      navigation.setOptions({
        title: 'Privacy Policy',
        headerStyle: { backgroundColor: Colors.light.background.primary },
        headerTintColor: Colors.light.text.primary,
        headerTitleStyle: { fontWeight: '600' },
        headerBackTitleVisible: false,
      });
    } catch (error) {
      handleError(error, { 
        component: 'PrivacyPolicyScreen',
        action: 'setNavigationOptions'
      });
    }
  }, [navigation, handleError]);

  useEffect(() => {
    reset();
  }, [reset]);

  return (
    <ErrorBoundary screenName="PrivacyPolicyScreen">
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          
          <View style={styles.header}>
            <Text style={styles.title}>Privacy Policy</Text>
            <Text style={styles.dateText}>Effective Date: [Insert Date]</Text>
            <Text style={styles.dateText}>Last Updated: [Insert Date]</Text>
          </View>

          <View style={styles.prioritySection}>
            <Text style={styles.priorityText}>
              🔐 Your privacy is our highest priority. Dynasty is built with privacy-by-design principles, implementing end-to-end encryption and advanced security measures.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. INFORMATION WE COLLECT</Text>
            <Text style={styles.bodyText}>
              <Text style={styles.boldText}>Account Information:</Text> Name, email, phone, profile pictures, family tree data{'\n\n'}
              <Text style={styles.boldText}>Content You Create:</Text> Stories, photos, videos, event information, messages{'\n\n'}
              <Text style={styles.boldText}>Technical Data:</Text> Device info, usage analytics, location data (when permitted)
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. END-TO-END ENCRYPTION</Text>
            <Text style={styles.bodyText}>
              <Text style={styles.boldText}>Message Security:</Text>{'\n'}
              • AES-256-GCM encryption for all messages{'\n'}
              • ECDH key exchange protocol{'\n'}
              • Keys stored locally on your device{'\n'}
              • We cannot decrypt your messages{'\n\n'}
              <Text style={styles.boldText}>Vault Security:</Text>{'\n'}
              • Files encrypted in transit and at rest{'\n'}
              • Multiple security layers protect your media
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. HOW WE USE YOUR DATA</Text>
            <Text style={styles.bodyText}>
              • Provide core platform functionality{'\n'}
              • Facilitate family tree connections{'\n'}
              • Deliver secure messaging and vault storage{'\n'}
              • Send account updates and notifications{'\n'}
              • Improve app performance and features{'\n'}
              • Comply with legal requirements
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>4. DATA SHARING</Text>
            <Text style={styles.bodyText}>
              <Text style={styles.boldText}>Within Your Family:</Text> Content shared according to your privacy settings{'\n\n'}
              <Text style={styles.boldText}>Service Providers:</Text> Firebase/Google Cloud for infrastructure{'\n\n'}
              <Text style={styles.boldText}>Legal Requirements:</Text> Only when required by law
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>5. YOUR PRIVACY RIGHTS</Text>
            <Text style={styles.bodyText}>
              • Access your personal data{'\n'}
              • Correct inaccurate information{'\n'}
              • Delete your account and data{'\n'}
              • Export your content{'\n'}
              • Control privacy settings{'\n'}
              • Opt-out of data collection
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>6. DATA RETENTION</Text>
            <Text style={styles.bodyText}>
              • Active accounts: Data retained while account is active{'\n'}
              • Messages: 30 days to unlimited (based on subscription){'\n'}
              • Account deletion: Complete removal within 30 days{'\n'}
              • Analytics: Anonymized after 24 months
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>7. CONTACT US</Text>
            <Text style={styles.bodyText}>
              <Text style={styles.boldText}>Privacy Questions:</Text>{'\n'}
              Email: privacy@[company].com{'\n'}
              Response within 30 days{'\n\n'}
              <Text style={styles.boldText}>Data Requests:</Text>{'\n'}
              Use in-app privacy settings or contact us directly
            </Text>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              This Privacy Policy is designed to be transparent about our data practices while ensuring the highest level of protection for your family's privacy and security.
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
    marginBottom: 20,
    paddingBottom: 15,
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
  prioritySection: {
    backgroundColor: Colors.light.primary + '15',
    padding: 15,
    borderRadius: 10,
    marginBottom: 25,
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.primary,
  },
  priorityText: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.primary,
    fontWeight: '500',
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
  boldText: {
    fontWeight: '600',
    color: Colors.light.text.primary,
  },
  footer: {
    marginTop: 20,
    padding: 20,
    backgroundColor: Colors.light.primary + '10',
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

export default PrivacyPolicyScreen;
