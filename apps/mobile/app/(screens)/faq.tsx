import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';

interface FAQItemProps {
  question: string;
  answer: string;
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { handleError, withErrorHandling } = useErrorHandler({
    severity: ErrorSeverity.LOW,
    title: 'FAQ Item Error',
  });

  const toggleExpansion = withErrorHandling(
    async () => {
      try {
        setIsOpen(!isOpen);
      } catch (error) {
        handleError(error, {
          functionName: 'toggleExpansion',
          question: question.substring(0, 50), // Truncate for privacy
        });
      }
    },
    { functionName: 'toggleExpansion' }
  );

  return (
    <View style={styles.faqItemContainer}>
      <TouchableOpacity style={styles.questionButton} onPress={toggleExpansion}>
        <Text style={styles.questionText}>{question}</Text>
        <Ionicons name={isOpen ? 'chevron-up-outline' : 'chevron-down-outline'} size={20} color="#555" />
      </TouchableOpacity>
      {isOpen && (
        <View style={styles.answerContainer}>
          <Text style={styles.answerText}>{answer}</Text>
        </View>
      )}
    </View>
  );
};

const MOCK_FAQS: FAQItemProps[] = [
  {
    question: "What is Dynasty?",
    answer: "Dynasty is a family-focused social media app designed to help you connect, share memories, and build your family tree."
  },
  {
    question: "How do I invite family members?",
    answer: "You can invite family members through the 'Family Management' section in your profile. You can send invitations via email or a shareable link."
  },
  {
    question: "Is my data private and secure?",
    answer: "Yes, we take your privacy and security very seriously. You have granular control over your privacy settings. Please refer to our Privacy Policy for more details."
  },
  {
    question: "How do I create a new story?",
    answer: "You can create a new story by tapping the '+' icon on the Feed or Story tabs and selecting 'Create Story'."
  },
  {
    question: "Can I recover a deleted account?",
    answer: "Account deletion is permanent. If you need assistance with account issues, please contact our support team before deleting your account."
  },
];

const FAQScreen = () => {
  const navigation = useNavigation();
  const { handleError, clearError, withErrorHandling } = useErrorHandler({
    severity: ErrorSeverity.INFO,
    title: 'FAQ Error',
    trackCurrentScreen: true,
  });

  // Reset error state when component mounts
  useEffect(() => {
    clearError();
  }, [clearError]);

  const setupNavigation = withErrorHandling(
    async () => {
      try {
        navigation.setOptions({
          title: 'FAQs',
          headerStyle: { backgroundColor: '#F8F8F8' },
          headerTintColor: '#333333',
          headerTitleStyle: { fontWeight: '600' },
          headerBackTitleVisible: false,
        });
      } catch (error) {
        handleError(error, {
          functionName: 'setupNavigation',
          screenName: 'FAQScreen',
        });
      }
    },
    { functionName: 'setupNavigation' }
  );

  const renderFAQItems = withErrorHandling(
    async () => {
      try {
        return MOCK_FAQS.map((faq, index) => (
          <FAQItem key={index} question={faq.question} answer={faq.answer} />
        ));
      } catch (error) {
        handleError(error, {
          functionName: 'renderFAQItems',
          itemCount: MOCK_FAQS.length,
        });
        return [];
      }
    },
    { functionName: 'renderFAQItems' }
  );

  useEffect(() => {
    setupNavigation();
  }, [navigation, setupNavigation]);

  return (
    <ErrorBoundary screenName="FAQScreen">
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.container}>
          {renderFAQItems()}
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
  },
  faqItemContainer: {
    backgroundColor: '#FFFFFF',
    marginBottom: 1, // Creates a thin separator line effect
  },
  questionButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  questionText: {
    fontSize: 16,
    color: '#333',
    flex: 1, // Allow text to wrap
    marginRight: 10,
  },
  answerContainer: {
    paddingHorizontal: 20,
    paddingBottom: 15,
    paddingTop: 5, // Small space between question and answer
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  answerText: {
    fontSize: 15,
    color: '#555',
    lineHeight: 22,
  },
});

export default FAQScreen; 