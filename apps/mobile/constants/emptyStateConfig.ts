import { StyleSheet } from 'react-native';

export const emptyStateStyles = StyleSheet.create({
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    padding: 20,
    marginTop: 50,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#555', // Consider using theme colors here
    marginTop: 15,
    textAlign: 'center',
  },
  emptyStateSubText: {
    fontSize: 14,
    color: '#777', // Consider using theme colors here
    marginTop: 5,
    textAlign: 'center',
  },
});
