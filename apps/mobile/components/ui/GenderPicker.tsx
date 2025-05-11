import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';

interface GenderPickerProps {
  isVisible: boolean;
  onDismiss: () => void;
  onGenderChange: (gender: string) => void;
  value: string;
  doneButtonLabel?: string;
}

const genderOptions = [
  { label: 'Select Gender...', value: '' },
  { label: 'Female', value: 'Female' },
  { label: 'Male', value: 'Male' },
  { label: 'Non-binary', value: 'Non-binary' },
  { label: 'Other', value: 'Other' },
  { label: 'Prefer not to say', value: 'Prefer not to say' },
];

const GenderPicker: React.FC<GenderPickerProps> = ({
  isVisible,
  onDismiss,
  onGenderChange,
  value,
  doneButtonLabel = 'Done',
}) => {
  // For Android, we show the picker directly in the UI
  if (Platform.OS === 'android') {
    return isVisible ? (
      <Picker
        selectedValue={value}
        onValueChange={(itemValue) => {
          onGenderChange(itemValue);
        }}
        mode="dropdown"
        style={styles.androidPicker}
      >
        {genderOptions.map((option) => (
          <Picker.Item 
            key={option.value} 
            label={option.label} 
            value={option.value} 
          />
        ))}
      </Picker>
    ) : null;
  }

  // For iOS, we use our full-screen modal picker
  return isVisible ? (
    <View style={styles.pickerOverlay}>
      <TouchableOpacity
        style={styles.backgroundDismiss}
        activeOpacity={1}
        onPress={onDismiss}
      />
      <View style={styles.pickerContainer}>
        <View style={styles.pickerHeader}>
          <TouchableOpacity onPress={onDismiss}>
            <Text style={styles.doneButton}>{doneButtonLabel}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.pickerWrapper}>
          <Picker
            selectedValue={value}
            onValueChange={(itemValue) => onGenderChange(itemValue)}
            style={styles.picker}
            itemStyle={styles.pickerItem}
          >
            {genderOptions.map((option) => (
              <Picker.Item 
                key={option.value} 
                label={option.label} 
                value={option.value} 
                color={option.value === '' ? '#A0A0A0' : '#333333'} 
              />
            ))}
          </Picker>
        </View>
      </View>
    </View>
  ) : null;
};

const styles = StyleSheet.create({
  pickerOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    zIndex: 1000,
    justifyContent: 'flex-end',
  },
  backgroundDismiss: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  pickerContainer: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 10,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    width: '100%',
  },
  doneButton: {
    color: '#1A4B44', // Dynasty Green
    fontSize: 16,
    fontWeight: '600',
  },
  pickerWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  picker: {
    height: 180,
    width: '100%',
  },
  pickerItem: {
    fontSize: 18,
  },
  androidPicker: {
    height: 50,
    width: '100%',
    backgroundColor: '#FFFFFF',
    marginBottom: 20,
  },
});

export default GenderPicker;