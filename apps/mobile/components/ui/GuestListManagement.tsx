import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, Alert, RefreshControl, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { Colors } from '@/constants/Colors';
import { Typography } from '@/constants/Typography';
import { Spacing, BorderRadius } from '@/constants/Spacing';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getEventAttendeesMobile, EventDetails } from '@src/lib/eventUtils';
import { showErrorAlert } from '@src/lib/errorUtils';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { ErrorSeverity } from '@/src/lib/ErrorHandlingService';

export interface GuestListManagementProps {
  eventId: string;
  isHost: boolean;
  allowGuestPlusOne: boolean;
  onSendReminder?: (userId: string) => void;
}

export interface Attendee {
  id: string;
  name: string;
  avatar?: string;
  status: 'pending' | 'accepted' | 'declined' | 'maybe';
  plusOne?: boolean;
  plusOneName?: string;
  respondedAt?: Date;
}

const GuestListManagement: React.FC<GuestListManagementProps> = ({
  eventId,
  isHost,
  allowGuestPlusOne,
  onSendReminder
}) => {
  const colorScheme = useColorScheme();
  const scheme = colorScheme ?? 'light';
  const { handleError, withErrorHandling } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Guest List Error',
    trackCurrentScreen: true
  });

  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'declined' | 'maybe'>('all');

  const styles = createStyles(scheme);

  const loadAttendees = withErrorHandling(async () => {
    try {
      const attendeeData = await getEventAttendeesMobile(eventId);
      setAttendees(attendeeData || []);
    } catch (error) {
      showErrorAlert('Failed to load guest list');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  });

  useEffect(() => {
    loadAttendees();
  }, [eventId, loadAttendees]);

  const onRefresh = withErrorHandling(async () => {
    setRefreshing(true);
    await loadAttendees();
  });

  const filteredAttendees = attendees.filter(attendee => {
    if (filter === 'all') return true;
    return attendee.status === filter;
  });

  const getStatusCounts = () => {
    const counts = {
      total: attendees.length,
      accepted: attendees.filter(a => a.status === 'accepted').length,
      declined: attendees.filter(a => a.status === 'declined').length,
      maybe: attendees.filter(a => a.status === 'maybe').length,
      pending: attendees.filter(a => a.status === 'pending').length,
      plusOnes: attendees.filter(a => a.plusOne).length
    };
    return counts;
  };

  const handleSendReminder = (userId: string, userName: string) => {
    Alert.alert(
      'Send Reminder',
      `Send RSVP reminder to ${userName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Send', 
          onPress: () => {
            if (onSendReminder) {
              onSendReminder(userId);
            } else {
              Alert.alert('Success', 'Reminder sent!');
            }
          }
        }
      ]
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted': return 'checkmark-circle';
      case 'declined': return 'close-circle';
      case 'maybe': return 'help-circle';
      case 'pending': return 'time';
      default: return 'help-circle';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return Colors[scheme].success;
      case 'declined': return Colors[scheme].error;
      case 'maybe': return Colors[scheme].warning;
      case 'pending': return Colors[scheme].text.secondary;
      default: return Colors[scheme].text.secondary;
    }
  };

  const counts = getStatusCounts();

  const FilterButton: React.FC<{ filterValue: typeof filter; label: string; count: number }> = ({ 
    filterValue, 
    label, 
    count 
  }) => (
    <TouchableOpacity
      style={[
        styles.filterButton,
        filter === filterValue && styles.filterButtonActive
      ]}
      onPress={() => setFilter(filterValue)}
    >
      <ThemedText style={[
        styles.filterButtonText,
        filter === filterValue && styles.filterButtonTextActive
      ]}>
        {label} ({count})
      </ThemedText>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.loadingText}>Loading guest list...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Summary Stats */}
      <Card style={styles.summaryCard}>
        <ThemedText style={styles.summaryTitle}>RSVP Summary</ThemedText>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <ThemedText style={styles.summaryNumber}>{counts.accepted}</ThemedText>
            <ThemedText style={styles.summaryLabel}>Going</ThemedText>
          </View>
          <View style={styles.summaryItem}>
            <ThemedText style={styles.summaryNumber}>{counts.maybe}</ThemedText>
            <ThemedText style={styles.summaryLabel}>Maybe</ThemedText>
          </View>
          <View style={styles.summaryItem}>
            <ThemedText style={styles.summaryNumber}>{counts.declined}</ThemedText>
            <ThemedText style={styles.summaryLabel}>Can&apos;t Go</ThemedText>
          </View>
          <View style={styles.summaryItem}>
            <ThemedText style={styles.summaryNumber}>{counts.pending}</ThemedText>
            <ThemedText style={styles.summaryLabel}>Pending</ThemedText>
          </View>
        </View>
        {allowGuestPlusOne && (
          <ThemedText style={styles.plusOnesSummary}>
            Plus ones: {counts.plusOnes}
          </ThemedText>
        )}
      </Card>

      {/* Filter Buttons */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContentContainer}
      >
        <FilterButton filterValue="all" label="All" count={counts.total} />
        <FilterButton filterValue="accepted" label="Going" count={counts.accepted} />
        <FilterButton filterValue="maybe" label="Maybe" count={counts.maybe} />
        <FilterButton filterValue="declined" label="Can't Go" count={counts.declined} />
        <FilterButton filterValue="pending" label="Pending" count={counts.pending} />
      </ScrollView>

      {/* Guest List */}
      <ScrollView
        style={styles.guestList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {filteredAttendees.map((attendee) => (
          <Card key={attendee.id} style={styles.guestCard}>
            <View style={styles.guestInfo}>
              <Avatar 
                imageUrl={attendee.avatar} 
                name={attendee.name} 
                size={50}
                style={styles.guestAvatar}
              />
              <View style={styles.guestDetails}>
                <ThemedText style={styles.guestName}>{attendee.name}</ThemedText>
                <View style={styles.statusRow}>
                  <Ionicons 
                    name={getStatusIcon(attendee.status)} 
                    size={16} 
                    color={getStatusColor(attendee.status)} 
                  />
                  <ThemedText style={[styles.statusText, { color: getStatusColor(attendee.status) }]}>
                    {attendee.status.charAt(0).toUpperCase() + attendee.status.slice(1)}
                  </ThemedText>
                </View>
                {attendee.plusOne && attendee.plusOneName && (
                  <ThemedText style={styles.plusOneText}>
                    +1: {attendee.plusOneName}
                  </ThemedText>
                )}
                {attendee.respondedAt && (
                  <ThemedText style={styles.responseDate}>
                    Responded {new Date(attendee.respondedAt).toLocaleDateString()}
                  </ThemedText>
                )}
              </View>
            </View>
            
            {isHost && attendee.status === 'pending' && (
              <TouchableOpacity
                style={styles.reminderButton}
                onPress={() => handleSendReminder(attendee.id, attendee.name)}
              >
                <Ionicons name="mail-outline" size={16} color={Colors[scheme].primary} />
                <ThemedText style={styles.reminderButtonText}>Remind</ThemedText>
              </TouchableOpacity>
            )}
          </Card>
        ))}
        
        {filteredAttendees.length === 0 && (
          <Card style={styles.emptyCard}>
            <ThemedText style={styles.emptyText}>
              {filter === 'all' 
                ? 'No guests invited yet' 
                : `No guests with status "${filter}"`
              }
            </ThemedText>
          </Card>
        )}
      </ScrollView>
    </ThemedView>
  );
};

const createStyles = (scheme: 'light' | 'dark') => StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.md,
  },
  loadingText: {
    textAlign: 'center',
    marginTop: Spacing.xl,
    ...Typography.body,
    color: Colors[scheme].text.secondary,
  },
  summaryCard: {
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  summaryTitle: {
    ...Typography.h3,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryNumber: {
    ...Typography.h2,
    fontWeight: 'bold',
    color: Colors[scheme].primary,
  },
  summaryLabel: {
    ...Typography.caption,
    color: Colors[scheme].text.secondary,
  },
  plusOnesSummary: {
    ...Typography.body,
    textAlign: 'center',
    marginTop: Spacing.sm,
    color: Colors[scheme].text.secondary,
  },
  filterContainer: {
    maxHeight: 50,
    marginBottom: Spacing.md,
  },
  filterContentContainer: {
    paddingHorizontal: Spacing.xs,
  },
  filterButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.sm,
    backgroundColor: Colors[scheme].background.secondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors[scheme].border,
  },
  filterButtonActive: {
    backgroundColor: Colors[scheme].primary,
    borderColor: Colors[scheme].primary,
  },
  filterButtonText: {
    ...Typography.caption,
    color: Colors[scheme].text.primary,
  },
  filterButtonTextActive: {
    color: Colors[scheme].background.primary,
    fontWeight: '600',
  },
  guestList: {
    flex: 1,
  },
  guestCard: {
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  guestInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  guestAvatar: {
    marginRight: Spacing.md,
  },
  guestDetails: {
    flex: 1,
  },
  guestName: {
    ...Typography.h4,
    marginBottom: Spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  statusText: {
    ...Typography.caption,
    marginLeft: Spacing.xs,
    fontWeight: '500',
  },
  plusOneText: {
    ...Typography.caption,
    color: Colors[scheme].text.secondary,
    marginBottom: Spacing.xs,
  },
  responseDate: {
    ...Typography.caption,
    color: Colors[scheme].text.tertiary,
    fontSize: 12,
  },
  reminderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors[scheme].background.secondary,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors[scheme].primary,
  },
  reminderButtonText: {
    ...Typography.caption,
    color: Colors[scheme].primary,
    marginLeft: Spacing.xs,
    fontWeight: '500',
  },
  emptyCard: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...Typography.body,
    color: Colors[scheme].text.secondary,
    textAlign: 'center',
  },
});

export default GuestListManagement;