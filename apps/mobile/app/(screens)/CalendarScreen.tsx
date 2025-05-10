import React from 'react';
import { StyleSheet, View, SafeAreaView, TouchableOpacity, Platform, Text } from 'react-native';
import { CalendarList, DateData } from 'react-native-calendars';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../../components/ui/AppHeader';
import { Colors } from '../../constants/Colors';

const CalendarScreen = () => {
  const router = useRouter();
  const currentThemeColors = Colors.light;

  const handleDayPress = (day: DateData) => {
    console.log('selected day', day);
    // TODO: Implement logic for when a day is pressed
  };

  const navigateToEventList = () => {
    router.push('/(tabs)/events', { screen: 'EventList' });
  };

  const renderHeaderRight = () => (
    <TouchableOpacity onPress={navigateToEventList} style={styles.headerButton}>
      <Ionicons name="list-outline" size={28} color={currentThemeColors.icon} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: currentThemeColors.background }]}>
      <AppHeader title="Calendar" headerRight={renderHeaderRight} />
      <View style={styles.container}>
        <CalendarList
          theme={{
            backgroundColor: currentThemeColors.background,
            calendarBackground: currentThemeColors.background,
            textSectionTitleColor: '#b6c1cd',
            selectedDayBackgroundColor: Colors.dynastyGreen,
            selectedDayTextColor: currentThemeColors.buttonText,
            todayTextColor: Colors.dynastyGreen,
            dayTextColor: currentThemeColors.text,
            textDisabledColor: currentThemeColors.icon,
            dotColor: Colors.dynastyGreen,
            selectedDotColor: currentThemeColors.buttonText,
            arrowColor: Colors.dynastyGreen,
            disabledArrowColor: '#d9e1e8',
            monthTextColor: Colors.dynastyGreen,
            indicatorColor: Colors.dynastyGreen,
            textDayFontSize: 16,
            textMonthFontSize: 16,
            textDayHeaderFontSize: 14,
          }}
          markedDates={{
            // Example: Mark today
            // [new Date().toISOString().split('T')[0]]: {today: true, marked: true, dotColor: Colors.dynastyGreen}
          }}
          pastScrollRange={12}
          futureScrollRange={24}
          scrollEnabled={true}
          showScrollIndicator={false}
          horizontal={false}
          pagingEnabled={false}
          onVisibleMonthsChange={(months) => {console.log('now these months are visible', months);}}
          onDayPress={handleDayPress}
          style={styles.calendarList}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  headerButton: {
    marginRight: Platform.OS === 'ios' ? 10 : 15,
    padding: 5,
  },
  calendarList: {
    // Styles for CalendarList itself, if needed
  },
});

export default CalendarScreen; 