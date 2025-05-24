import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TextInput, TouchableOpacity, Alert, Linking, Platform } from 'react-native';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { showErrorAlert } from '../../src/lib/errorUtils';
import ErrorBoundary from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';

const SUPPORT_EMAIL = "support@dynastyapp.example.com";

const ContactSupportScreen = () => {
  const navigation = useNavigation();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  
  // Initialize error handler
  const { handleError, withErrorHandling, reset } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Contact Support Error',
    trackCurrentScreen: true
  });

  useEffect(() => {
    navigation.setOptions({
      title: 'Contact Support',
      headerStyle: { backgroundColor: '#F8F8F8' },
      headerTintColor: '#333333',
      headerTitleStyle: { fontWeight: '600' },
      headerBackTitleVisible: false,
    });
  }, [navigation]);

  // Reset error state when component unmounts or when needed
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  const handleSendMessage = withErrorHandling(async () => {
    try {
      if (!subject.trim() || !message.trim()) {
        const validationError = new Error("Please provide a subject and your message.");
        handleError(validationError, {
          action: 'input_validation',
          subject: subject ? 'provided' : 'missing',
          message: message ? 'provided' : 'missing'
        });
        showErrorAlert({ message: "Please provide a subject and your message.", code: "invalid-argument" }, "Missing Information");
        return;
      }

      const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      
      const supported = await Linking.canOpenURL(mailtoUrl);
      if (!supported) {
        const linkingError = new Error(`Cannot open email client. Please contact us at ${SUPPORT_EMAIL}`);
        handleError(linkingError, {
          action: 'email_client_check',
          mailtoUrl,
          platform: Platform.OS
        });
        showErrorAlert({ message: "Cannot open email client. Please contact us at " + SUPPORT_EMAIL, code: "service-unavailable" }, "Error");
      } else {
        await Linking.openURL(mailtoUrl);
      }
    } catch (err) {
      console.error('An error occurred opening mail client', err);
      handleError(err, {
        action: 'send_message',
        subject: subject.substring(0, 50), // Limit length for logging
        messageLength: message.length,
        platform: Platform.OS
      });
      showErrorAlert(err, "Error");
    }
  });

  return (
    <ErrorBoundary screenName="ContactSupportScreen">
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom: 20}}>
          <Text style={styles.infoText}>
            Have a question or need help? Fill out the form below, or email us directly at <Text style={styles.emailLink} onPress={withErrorHandling(async () => {
              try {
                await Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
              } catch (err) {
                handleError(err, {
                  action: 'direct_email_link',
                  email: SUPPORT_EMAIL,
                  platform: Platform.OS
                });
              }
            })}>{SUPPORT_EMAIL}</Text>.
          </Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Subject</Text>
            <TextInput
              style={styles.input}
              value={subject}
              onChangeText={setSubject}
              placeholder="e.g., Issue with event creation"
              placeholderTextColor="#A0A0A0"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Message</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={message}
              onChangeText={setMessage}
              placeholder="Describe your issue or question in detail..."
              placeholderTextColor="#A0A0A0"
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
            <Ionicons name="send-outline" size={20} color="#FFFFFF" style={styles.sendIcon} />
            <Text style={styles.sendButtonText}>Send Message</Text>
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F0F0',
  },
  container: {
    flex: 1,
    paddingHorizontal: 15,
    paddingTop: 20,
  },
  infoText: {
    fontSize: 15,
    color: '#555',
    lineHeight: 22,
    marginBottom: 25,
    textAlign: 'center',
  },
  emailLink: {
    color: '#007AFF',
  },
  inputGroup: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    fontSize: 16,
    color: '#333',
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
  },
  textArea: {
    minHeight: 120,
    paddingTop: Platform.OS === 'ios' ? 12 : 10,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 10,
  },
  sendIcon: {
    marginRight: 10,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ContactSupportScreen; 