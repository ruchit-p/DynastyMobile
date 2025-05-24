import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import Typography from '../../constants/Typography';
import { Spacing , BorderRadius } from '../../constants/Spacing';
import { AuditLogService } from '../../src/services/encryption';
import { callFirebaseFunction } from '../../src/lib/errorUtils';
import { format } from 'date-fns';
import Button from '../../components/ui/Button';
import { useColorScheme } from '../../hooks/useColorScheme';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import FlashList from '../../components/ui/FlashList';

interface AuditLog {
  id: string;
  eventType: string;
  description: string;
  timestamp: number;
  userId?: string;
  resourceId?: string;
  metadata?: any;
}

export default function AuditLogsScreen() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    loadAuditLogs();
  }, [filter]);

  const loadAuditLogs = async () => {
    try {
      setLoading(true);
      const result = await callFirebaseFunction('exportAuditLogs', {
        ownLogsOnly: true,
        format: 'json',
        eventTypes: filter ? [filter] : undefined,
      });
      
      if (result.data && Array.isArray(result.data)) {
        setLogs(result.data);
      }
    } catch (error) {
      console.error('Failed to load audit logs:', error);
      Alert.alert('Error', 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const exportLogs = async (format: 'json' | 'csv') => {
    try {
      setExporting(true);
      const result = await callFirebaseFunction('exportAuditLogs', {
        ownLogsOnly: true,
        format,
      });

      const fileName = `audit_logs_${format}_${Date.now()}.${format}`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;
      
      await FileSystem.writeAsStringAsync(
        filePath,
        typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)
      );

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: format === 'json' ? 'application/json' : 'text/csv',
          dialogTitle: 'Export Audit Logs',
        });
      } else {
        Alert.alert('Success', `Logs exported to ${fileName}`);
      }
    } catch (error) {
      console.error('Failed to export logs:', error);
      Alert.alert('Error', 'Failed to export audit logs');
    } finally {
      setExporting(false);
    }
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'encryption_initialized':
        return 'key';
      case 'message_sent':
        return 'send';
      case 'file_uploaded':
        return 'cloud-upload';
      case 'key_rotation_completed':
        return 'refresh';
      case 'share_link_created':
        return 'link';
      case 'authentication_failed':
        return 'alert-circle';
      default:
        return 'information-circle';
    }
  };

  const getEventColor = (eventType: string) => {
    if (eventType.includes('failed') || eventType.includes('error')) {
      return Colors[colorScheme].status.error;
    }
    if (eventType.includes('warning') || eventType.includes('suspicious')) {
      return Colors[colorScheme].status.warning;
    }
    return Colors.dynastyGreen;
  };

  const renderLogItem = ({ item }: { item: AuditLog }) => (
    <TouchableOpacity
      style={[styles.logItem, { backgroundColor: Colors[colorScheme].background.secondary }]}
      onPress={() => Alert.alert(
        'Audit Log Details',
        `Event: ${item.eventType}\nDescription: ${item.description}\nTime: ${format(new Date(item.timestamp), 'PPpp')}\n${item.resourceId ? `Resource: ${item.resourceId}\n` : ''}${item.metadata ? `\nMetadata: ${JSON.stringify(item.metadata, null, 2)}` : ''}`,
        [{ text: 'OK' }]
      )}
    >
      <View style={styles.logHeader}>
        <View style={[styles.iconContainer, { backgroundColor: getEventColor(item.eventType) + '20' }]}>
          <Ionicons name={getEventIcon(item.eventType) as any} size={20} color={getEventColor(item.eventType)} />
        </View>
        <View style={styles.logContent}>
          <Text style={[styles.eventType, { color: Colors[colorScheme].text.primary }]}>
            {item.eventType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </Text>
          <Text style={[styles.description, { color: Colors[colorScheme].text.secondary }]}>
            {item.description}
          </Text>
          <Text style={[styles.timestamp, { color: Colors[colorScheme].text.secondary }]}>
            {format(new Date(item.timestamp), 'MMM d, yyyy h:mm a')}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const filterOptions = [
    { label: 'All', value: null },
    { label: 'Encryption', value: 'encryption_initialized' },
    { label: 'Messages', value: 'message_sent' },
    { label: 'Files', value: 'file_uploaded' },
    { label: 'Security', value: 'key_rotation_completed' },
    { label: 'Sharing', value: 'share_link_created' },
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Audit Logs',
          headerRight: () => (
            <TouchableOpacity onPress={() => exportLogs('json')}>
              <Ionicons name="download-outline" size={24} color={Colors.dynastyGreen} />
            </TouchableOpacity>
          ),
        }}
      />
      
      <View style={[styles.container, { backgroundColor: Colors[colorScheme].background.primary }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
          {filterOptions.map((option) => (
            <TouchableOpacity
              key={option.value || 'all'}
              style={[
                styles.filterChip,
                {
                  backgroundColor: filter === option.value
                    ? Colors.dynastyGreen
                    : Colors[colorScheme].background.secondary,
                },
              ]}
              onPress={() => setFilter(option.value)}
            >
              <Text
                style={[
                  styles.filterText,
                  {
                    color: filter === option.value
                      ? Colors[colorScheme].text.inverse
                      : Colors[colorScheme].text.primary,
                  },
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dynastyGreen} />
          </View>
        ) : logs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={48} color={Colors[colorScheme].text.secondary} />
            <Text style={[styles.emptyText, { color: Colors[colorScheme].text.secondary }]}>
              No audit logs available
            </Text>
            <Text style={[styles.emptySubtext, { color: Colors[colorScheme].text.secondary }]}>
              Audit logs will appear here when events occur
            </Text>
          </View>
        ) : (
          <FlashList
            data={logs}
            renderItem={renderLogItem}
            keyExtractor={(item) => item.id}
            estimatedItemSize={100}
            contentContainerStyle={styles.listContent}
          />
        )}

        {!loading && logs.length > 0 && (
          <View style={styles.exportContainer}>
            <Button
              title="Export as CSV"
              onPress={() => exportLogs('csv')}
              loading={exporting}
              disabled={exporting}
              variant="secondary"
            />
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterContainer: {
    maxHeight: 60,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
  },
  filterText: {
    ...Typography.styles.bodySmall,
    fontWeight: Typography.weight.medium,
  },
  listContent: {
    padding: Spacing.md,
  },
  logItem: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  logContent: {
    flex: 1,
  },
  eventType: {
    ...Typography.styles.bodyMedium,
    fontWeight: Typography.weight.semiBold,
    marginBottom: Spacing.xs,
  },
  description: {
    ...Typography.styles.bodySmall,
    marginBottom: Spacing.xs,
  },
  timestamp: {
    ...Typography.styles.caption,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing['5xl'],
  },
  emptyText: {
    ...Typography.styles.bodyLarge,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    ...Typography.styles.bodySmall,
    marginTop: Spacing.md,
  },
  exportContainer: {
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border.primary,
  },
});