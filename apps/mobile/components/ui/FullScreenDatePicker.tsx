import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import DateTimePickerModal from "react-native-modal-datetime-picker";

interface FullScreenDatePickerProps {
  isVisible: boolean;
  onDismiss: () => void;
  onDateChange: (date: Date) => void;
  value: Date | null;
  maximumDate?: Date;
  minimumDate?: Date;
  mode?: 'date' | 'time' | 'datetime';
  doneButtonLabel?: string;
  headerTitle?: string;
  timeZoneName?: string;
  confirmTextIOS?: string;
  cancelTextIOS?: string;
  display?: 'default' | 'spinner' | 'clock' | 'calendar';
}

const FullScreenDatePicker: React.FC<FullScreenDatePickerProps> = ({
  isVisible,
  onDismiss,
  onDateChange,
  value,
  maximumDate,
  minimumDate,
  mode = 'date',
  doneButtonLabel = 'Done',
  headerTitle,
  timeZoneName,
  confirmTextIOS,
  cancelTextIOS,
  display = 'spinner',
}) => {
  // For Android, we use the built-in modal from DateTimePicker
  if (Platform.OS === 'android') {
    return isVisible ? (
      <DateTimePicker
        testID="dateTimePicker"
        value={value || new Date()}
        mode={mode}
        display={display}
        onChange={(event, selectedDate) => {
          if (event.type === 'set' && selectedDate) {
            onDateChange(selectedDate);
          }
          onDismiss(); // Always dismiss for Android
        }}
        maximumDate={maximumDate}
        minimumDate={minimumDate}
      />
    ) : null;
  }

  // For iOS, we use modal or full-screen picker based on the mode
  if (mode === 'time' || mode === 'datetime') {
    // Use react-native-modal-datetime-picker for time/datetime
    return (
      <DateTimePickerModal
        isVisible={isVisible}
        mode={mode}
        onConfirm={(date) => {
          onDateChange(date);
          onDismiss();
        }}
        onCancel={onDismiss}
        date={value || new Date()}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        timeZoneName={timeZoneName}
        headerTextIOS={headerTitle}
        confirmTextIOS={confirmTextIOS}
        cancelTextIOS={cancelTextIOS}
        pickerComponentStyleIOS={{ width: '100%' }} // Stretch picker wheels horizontally
      />
    );
  }

  // For iOS date picker, we use our custom full-screen implementation
  return isVisible ? (
    <View style={styles.pickerOverlay}>
      <TouchableOpacity
        style={styles.backgroundDismiss}
        activeOpacity={1}
        onPress={onDismiss}
      />
      <View style={styles.pickerContainer}>
        <View style={styles.pickerHeader}>
          {headerTitle && <Text style={styles.headerTitle}>{headerTitle}</Text>}
          <TouchableOpacity style={styles.doneButtonContainer} onPress={onDismiss}>
            <Text style={styles.doneButton}>{doneButtonLabel}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.datePickerContainer}>
          <DateTimePicker
            testID="dateTimePicker"
            value={value || new Date()}
            mode={mode}
            display={display}
            onChange={(event, selectedDate) => {
              if (selectedDate) {
                onDateChange(selectedDate);
              }
            }}
            maximumDate={maximumDate}
            minimumDate={minimumDate}
            textColor="#333333"
            style={styles.datePicker}
          />
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
    top: 0, // Cover the entire screen
    zIndex: 1000,
    justifyContent: 'flex-end', // Position at bottom
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    width: '100%',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333333',
    flex: 1,
    textAlign: 'center',
  },
  doneButtonContainer: {
    marginLeft: 'auto',
  },
  doneButton: {
    color: '#1A4B44', // Dynasty Green
    fontSize: 16,
    fontWeight: '600',
  },
  datePickerContainer: {
    width: '100%',
    alignItems: 'center',
  },
  datePicker: {
    height: 180,
    width: '100%',
  },
});

export default FullScreenDatePicker;