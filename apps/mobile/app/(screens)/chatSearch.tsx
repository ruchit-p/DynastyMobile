import React, { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors } from '../../constants/Colors';
import { useThemeColor } from '../../hooks/useThemeColor';
import { FlashList } from '../../components/ui/FlashList';
import { ChatEncryptionService, Message } from '../../src/services/encryption/ChatEncryptionService';
import { debounce } from 'lodash';
import { format } from 'date-fns';
import { logger } from '../../src/services/LoggingService';

interface ChatSearchParams {
  chatId?: string;
}

interface SearchResult extends Message {
  highlightedText?: string;
  chatName?: string;
}

export default function ChatSearchScreen() {
  const params = useLocalSearchParams<ChatSearchParams>();
  const router = useRouter();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'border');

  // Debounced search function
  const performSearch = useMemo(
    () => debounce(async (query: string) => {
      if (!query.trim() || query.length < 3) {
        setSearchResults([]);
        setHasSearched(false);
        return;
      }

      setIsSearching(true);
      setHasSearched(true);
      
      try {
        const results = await ChatEncryptionService.searchMessages(
          query,
          params.chatId
        );
        
        // Process results to add highlighted text
        const processedResults: SearchResult[] = results.map(message => {
          const text = message.text || '';
          const lowerText = text.toLowerCase();
          const lowerQuery = query.toLowerCase();
          const highlightIndex = lowerText.indexOf(lowerQuery);
          
          let highlightedText = text;
          if (highlightIndex !== -1) {
            const before = text.substring(0, highlightIndex);
            const match = text.substring(highlightIndex, highlightIndex + query.length);
            const after = text.substring(highlightIndex + query.length);
            highlightedText = `${before}[HL]${match}[/HL]${after}`;
          }
          
          return {
            ...message,
            highlightedText,
          };
        });
        
        setSearchResults(processedResults);
      } catch (error) {
        logger.error('Search failed:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 500),
    [params.chatId]
  );

  // Handle search input change
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    performSearch(text);
  }, [performSearch]);

  // Navigate to message in chat
  const handleResultPress = useCallback((result: SearchResult) => {
    router.push({
      pathname: '/(screens)/chatDetail',
      params: {
        chatId: result.chatId,
        messageId: result.id,
        // Add other necessary params
      },
    });
  }, [router]);

  // Render search result
  const renderSearchResult = useCallback(({ item }: { item: SearchResult }) => {
    const isOwnMessage = item.senderId === user?.uid;
    const timestamp = item.timestamp instanceof Date 
      ? item.timestamp 
      : item.timestamp.toDate();
    
    // Parse highlighted text
    const renderHighlightedText = (text: string) => {
      const parts = text.split(/\[HL\]|\[\/HL\]/);
      return parts.map((part, index) => {
        const isHighlighted = index % 2 === 1;
        return (
          <Text
            key={index}
            style={[
              styles.resultText,
              { color: textColor },
              isHighlighted && styles.highlightedText,
            ]}
          >
            {part}
          </Text>
        );
      });
    };

    return (
      <TouchableOpacity
        style={[styles.resultItem, { borderBottomColor: borderColor }]}
        onPress={() => handleResultPress(item)}
      >
        <View style={styles.resultHeader}>
          <Text style={[styles.resultSender, { color: Colors.light.primary }]}>
            {isOwnMessage ? 'You' : 'Other'} {/* In production, show actual names */}
          </Text>
          <Text style={[styles.resultDate, { color: textColor }]}>
            {format(timestamp, 'MMM d, yyyy')}
          </Text>
        </View>
        <View style={styles.resultContent}>
          {item.type === 'text' ? (
            renderHighlightedText(item.highlightedText || item.text || '')
          ) : (
            <Text style={[styles.resultText, { color: textColor, fontStyle: 'italic' }]}>
              {item.type === 'voice' ? '🎤 Voice message' : 
               item.type === 'media' ? '📷 Photo' : '📎 File'}
            </Text>
          )}
        </View>
        {item.chatName && (
          <Text style={[styles.resultChat, { color: textColor }]}>
            in {item.chatName}
          </Text>
        )}
      </TouchableOpacity>
    );
  }, [user, textColor, borderColor, handleResultPress]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Search Header */}
        <View style={[styles.searchHeader, { borderBottomColor: borderColor }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <View style={[styles.searchInputContainer, { backgroundColor: borderColor }]}>
            <Ionicons name="search" size={20} color={textColor} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: textColor }]}
              placeholder="Search messages..."
              placeholderTextColor={textColor + '80'}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoFocus
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => handleSearchChange('')}>
                <Ionicons name="close-circle" size={20} color={textColor} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Search Results */}
        {isSearching ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
            <Text style={[styles.statusText, { color: textColor }]}>Searching...</Text>
          </View>
        ) : !hasSearched ? (
          <View style={styles.centerContainer}>
            <Ionicons name="search" size={64} color={borderColor} />
            <Text style={[styles.statusText, { color: textColor }]}>
              Enter at least 3 characters to search
            </Text>
          </View>
        ) : searchResults.length === 0 ? (
          <View style={styles.centerContainer}>
            <Ionicons name="search-outline" size={64} color={borderColor} />
            <Text style={[styles.statusText, { color: textColor }]}>
              No messages found for &quot;{searchQuery}&quot;
            </Text>
          </View>
        ) : (
          <FlashList
            data={searchResults}
            renderItem={renderSearchResult}
            keyExtractor={(item) => item.id}
            estimatedItemSize={80}
            contentContainerStyle={styles.resultsList}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    marginRight: 12,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  statusText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  resultsList: {
    paddingBottom: 20,
  },
  resultItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  resultSender: {
    fontSize: 14,
    fontWeight: '600',
  },
  resultDate: {
    fontSize: 12,
  },
  resultContent: {
    marginBottom: 4,
  },
  resultText: {
    fontSize: 15,
    lineHeight: 20,
  },
  highlightedText: {
    backgroundColor: Colors.light.primary + '30',
    fontWeight: '600',
  },
  resultChat: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  separator: {
    height: 0,
  },
});