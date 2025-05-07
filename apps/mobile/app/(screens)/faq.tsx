import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

interface FAQItemProps {
  question: string;
  answer: string;
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View style={styles.faqItemContainer}>
      <TouchableOpacity style={styles.questionButton} onPress={() => setIsOpen(!isOpen)}>
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

  useEffect(() => {
    navigation.setOptions({
      title: 'FAQs',
      headerStyle: { backgroundColor: '#F8F8F8' },
      headerTintColor: '#333333',
      headerTitleStyle: { fontWeight: '600' },
      headerBackTitleVisible: false,
    });
  }, [navigation]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        {MOCK_FAQS.map((faq, index) => (
          <FAQItem key={index} question={faq.question} answer={faq.answer} />
        ))}
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