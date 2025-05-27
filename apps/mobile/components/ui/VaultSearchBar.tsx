import React, { useState } from 'react';
import { StyleSheet, View, TextInput, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '../ThemedText';
import IconButton, { IconSet } from './IconButton';
import Button from './Button';
import Divider from './Divider';
import { Colors } from '../../constants/Colors';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import Fonts from '../../constants/Fonts';

export interface VaultSearchFilters {
  query: string;
  fileTypes: string[];
  sortBy: 'name' | 'date' | 'size' | 'type';
  sortOrder: 'asc' | 'desc';
}

interface VaultSearchBarProps {
  filters: VaultSearchFilters;
  onFiltersChange: (filters: VaultSearchFilters) => void;
  onSearch: () => void;
  placeholder?: string;
}

const VaultSearchBar: React.FC<VaultSearchBarProps> = ({
  filters,
  onFiltersChange,
  onSearch,
  placeholder = 'Search files and folders...'
}) => {
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [localFilters, setLocalFilters] = useState(filters);

  const fileTypeOptions = [
    { label: 'Images', value: 'image', icon: 'image-outline' },
    { label: 'Videos', value: 'video', icon: 'videocam-outline' },
    { label: 'Audio', value: 'audio', icon: 'musical-notes-outline' },
    { label: 'Documents', value: 'document', icon: 'document-outline' },
    { label: 'Other', value: 'other', icon: 'file-tray-outline' },
  ];

  const sortOptions = [
    { label: 'Name', value: 'name' },
    { label: 'Date', value: 'date' },
    { label: 'Size', value: 'size' },
    { label: 'Type', value: 'type' },
  ];

  const handleQueryChange = (text: string) => {
    const newFilters = { ...filters, query: text };
    onFiltersChange(newFilters);
  };

  const toggleFileType = (fileType: string) => {
    const newTypes = localFilters.fileTypes.includes(fileType)
      ? localFilters.fileTypes.filter(t => t !== fileType)
      : [...localFilters.fileTypes, fileType];
    setLocalFilters({ ...localFilters, fileTypes: newTypes });
  };

  const applyFilters = () => {
    onFiltersChange(localFilters);
    setShowFilterModal(false);
    onSearch();
  };

  const resetFilters = () => {
    const defaultFilters: VaultSearchFilters = {
      query: filters.query,
      fileTypes: [],
      sortBy: 'name',
      sortOrder: 'asc'
    };
    setLocalFilters(defaultFilters);
    onFiltersChange(defaultFilters);
    setShowFilterModal(false);
    onSearch();
  };

  const hasActiveFilters = filters.fileTypes.length > 0 || 
    filters.sortBy !== 'name' || 
    filters.sortOrder !== 'asc';

  return (
    <>
      <View style={styles.container}>
        <View style={styles.searchContainer}>
          <Ionicons 
            name="search-outline" 
            size={20} 
            color={Colors.light.text.secondary} 
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor={Colors.light.text.secondary}
            value={filters.query}
            onChangeText={handleQueryChange}
            onSubmitEditing={onSearch}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          <IconButton
            iconSet={IconSet.Ionicons}
            iconName="options-outline"
            size={20}
            color={hasActiveFilters ? Colors.dynastyGreen : Colors.light.text.secondary}
            onPress={() => {
              setLocalFilters(filters);
              setShowFilterModal(true);
            }}
            style={styles.filterButton}
          />
        </View>
      </View>

      <Modal
        visible={showFilterModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText variant="heading3">Filter & Sort</ThemedText>
              <IconButton
                iconSet={IconSet.Ionicons}
                iconName="close"
                size={24}
                onPress={() => setShowFilterModal(false)}
              />
            </View>

            <ScrollView style={styles.modalBody}>
              {/* File Type Filter */}
              <View style={styles.section}>
                <ThemedText variant="bodyMedium" weight="semibold" style={styles.sectionTitle}>
                  File Types
                </ThemedText>
                {fileTypeOptions.map(option => (
                  <TouchableOpacity
                    key={option.value}
                    style={styles.optionItem}
                    onPress={() => toggleFileType(option.value)}
                  >
                    <View style={styles.optionLeft}>
                      <Ionicons 
                        name={option.icon as any} 
                        size={20} 
                        color={Colors.light.text.primary} 
                        style={styles.optionIcon}
                      />
                      <ThemedText variant="bodyMedium">{option.label}</ThemedText>
                    </View>
                    {localFilters.fileTypes.includes(option.value) && (
                      <Ionicons 
                        name="checkmark" 
                        size={20} 
                        color={Colors.dynastyGreen}
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <Divider style={styles.divider} />

              {/* Sort Options */}
              <View style={styles.section}>
                <ThemedText variant="bodyMedium" weight="semibold" style={styles.sectionTitle}>
                  Sort By
                </ThemedText>
                {sortOptions.map(option => (
                  <TouchableOpacity
                    key={option.value}
                    style={styles.optionItem}
                    onPress={() => setLocalFilters({ 
                      ...localFilters, 
                      sortBy: option.value as any 
                    })}
                  >
                    <ThemedText variant="bodyMedium">{option.label}</ThemedText>
                    {localFilters.sortBy === option.value && (
                      <Ionicons 
                        name="checkmark" 
                        size={20} 
                        color={Colors.dynastyGreen}
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <Divider style={styles.divider} />

              {/* Sort Order */}
              <View style={styles.section}>
                <ThemedText variant="bodyMedium" weight="semibold" style={styles.sectionTitle}>
                  Sort Order
                </ThemedText>
                <TouchableOpacity
                  style={styles.optionItem}
                  onPress={() => setLocalFilters({ ...localFilters, sortOrder: 'asc' })}
                >
                  <View style={styles.optionLeft}>
                    <Ionicons 
                      name="arrow-up" 
                      size={20} 
                      color={Colors.light.text.primary} 
                      style={styles.optionIcon}
                    />
                    <ThemedText variant="bodyMedium">Ascending</ThemedText>
                  </View>
                  {localFilters.sortOrder === 'asc' && (
                    <Ionicons 
                      name="checkmark" 
                      size={20} 
                      color={Colors.dynastyGreen}
                    />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.optionItem}
                  onPress={() => setLocalFilters({ ...localFilters, sortOrder: 'desc' })}
                >
                  <View style={styles.optionLeft}>
                    <Ionicons 
                      name="arrow-down" 
                      size={20} 
                      color={Colors.light.text.primary} 
                      style={styles.optionIcon}
                    />
                    <ThemedText variant="bodyMedium">Descending</ThemedText>
                  </View>
                  {localFilters.sortOrder === 'desc' && (
                    <Ionicons 
                      name="checkmark" 
                      size={20} 
                      color={Colors.dynastyGreen}
                    />
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Button
                variant="secondary"
                size="medium"
                onPress={resetFilters}
                style={styles.footerButton}
              >
                Reset
              </Button>
              <Button
                variant="primary"
                size="medium"
                onPress={applyFilters}
                style={styles.footerButton}
              >
                Apply
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.light.background.primary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.background.secondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    height: 44,
  },
  searchIcon: {
    marginRight: Spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: Fonts.size.medium,
    fontFamily: Fonts.family.medium,
    color: Colors.light.text.primary,
  },
  filterButton: {
    marginLeft: Spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.light.background.primary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  modalBody: {
    paddingHorizontal: Spacing.md,
  },
  section: {
    paddingVertical: Spacing.md,
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
    color: Colors.light.text.secondary,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIcon: {
    marginRight: Spacing.sm,
  },
  divider: {
    marginVertical: Spacing.xs,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  footerButton: {
    flex: 1,
    marginHorizontal: Spacing.xs,
  },
});

export default VaultSearchBar;