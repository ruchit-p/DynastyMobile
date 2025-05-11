import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Screen from '../../components/ui/Screen';
import AppHeader from '../../components/ui/AppHeader';

const HelpAndSupportScreen = () => {
  return (
    <Screen>
      <AppHeader title="Help & Support" />
      <View style={styles.container}>
        <Text>Help and Support Content Coming Soon!</Text>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default HelpAndSupportScreen; 