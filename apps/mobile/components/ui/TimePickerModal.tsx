import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

interface TimePickerModalProps {
  isVisible: boolean;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
  value: Date;
  is24Hour?: boolean;
  confirmText?: string;
  cancelText?: string;
  timeZoneName?: string;
}

const TimePickerModal: React.FC<TimePickerModalProps> = ({
  isVisible,
  onConfirm,
  onCancel,
  value,
  is24Hour = false,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  timeZoneName,
}) => {
  const [selectedTime, setSelectedTime] = useState<Date>(value);

  if (!isVisible) return null;

  // For Android, we use the built-in modal from DateTimePicker
  if (Platform.OS === 'android') {
    return (
      <DateTimePicker
        value={value}
        mode="time"
        is24Hour={is24Hour}
        display="default"
        onChange={(event, selectedDate) => {
          if (event.type === 'set' && selectedDate) {
            onConfirm(selectedDate);
          } else {
            onCancel();
          }
        }}
      />
    );
  }

  // For iOS, we use our custom modal picker
  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="slide"
    >
      <View style={styles.modalContainer}>
        <View style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <DateTimePicker
              value={selectedTime || value}
              mode="time"
              display="spinner"
              is24Hour={is24Hour}
              onChange={(event, selectedDate) => {
                if (selectedDate) {
                  setSelectedTime(selectedDate);
                }
              }}
              textColor="#333333"
              style={styles.picker}
              timeZoneName={timeZoneName}
            />
          </View>

          <TouchableOpacity
            style={styles.confirmButton}
            onPress={() => onConfirm(selectedTime || value)}
          >
            <Text style={styles.confirmButtonText}>{confirmText}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
          >
            <Text style={styles.cancelButtonText}>{cancelText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  pickerContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
  },
  pickerHeader: {
    alignItems: 'center',
    padding: 15,
    borderBottomColor: '#E0E0E0',
  },
  picker: {
    width: '100%',
    height: 200,
  },
  confirmButton: {
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  confirmButtonText: {
    color: '#007AFF',
    fontSize: 18,
    fontWeight: '500',
  },
  cancelButton: {
    alignItems: 'center',
    padding: 15,
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  cancelButtonText: {
    color: '#007AFF',
    fontSize: 18,
  },
});

export default TimePickerModal;