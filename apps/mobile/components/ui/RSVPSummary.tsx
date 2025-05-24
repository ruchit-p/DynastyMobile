import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ThemedText from '@/components/ThemedText';
import Card from '@/components/ui/Card';
import Colors from '@/constants/Colors';
import { Typography } from '@/constants/Typography';
import { Spacing, BorderRadius } from '@/constants/Spacing';
import { useColorScheme } from '@/hooks/useColorScheme';
import { RSVPProgressBar } from './RSVPStatusIndicator';

export interface RSVPSummaryData {
  totalInvited: number;
  accepted: number;
  declined: number;
  maybe: number;
  pending: number;
  plusOnes: number;
  responseRate: number;
  estimatedAttendance: number;
}

export interface RSVPSummaryProps {
  data: RSVPSummaryData;
  showDetailedStats?: boolean;
  showAttendancePrediction?: boolean;
  style?: any;
}

const RSVPSummary: React.FC<RSVPSummaryProps> = ({
  data,
  showDetailedStats = true,
  showAttendancePrediction = true,
  style
}) => {
  const colorScheme = useColorScheme();
  const scheme = colorScheme ?? 'light';
  const styles = createStyles(scheme);

  const {
    totalInvited,
    accepted,
    declined,
    maybe,
    pending,
    plusOnes,
    responseRate,
    estimatedAttendance
  } = data;

  const confirmedAttendees = accepted + (maybe * 0.7); // Assume 70% of "maybe" will attend
  const totalWithPlusOnes = accepted + plusOnes;

  const StatCard: React.FC<{
    icon: string;
    value: string | number;
    label: string;
    color?: string;
    subValue?: string;
  }> = ({ icon, value, label, color, subValue }) => (
    <View style={styles.statCard}>
      <View style={styles.statHeader}>
        <Ionicons 
          name={icon as any} 
          size={20} 
          color={color || Colors[scheme].text.primary} 
        />
        <ThemedText style={[styles.statValue, color && { color }]}>
          {value}
        </ThemedText>
      </View>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
      {subValue && (
        <ThemedText style={styles.statSubValue}>{subValue}</ThemedText>
      )}
    </View>
  );

  return (
    <Card style={[styles.container, style]}>
      <ThemedText style={styles.title}>RSVP Analytics</ThemedText>
      
      {/* Progress Bar */}
      <RSVPProgressBar
        totalInvited={totalInvited}
        accepted={accepted}
        declined={declined}
        maybe={maybe}
        pending={pending}
        showCounts={true}
        style={styles.progressBar}
      />

      {/* Key Stats Grid */}
      <View style={styles.statsGrid}>
        <StatCard
          icon="people"
          value={totalInvited}
          label="Total Invited"
        />
        <StatCard
          icon="checkmark-circle"
          value={accepted}
          label="Confirmed"
          color={Colors[scheme].success}
          subValue={plusOnes > 0 ? `+${plusOnes} guests` : undefined}
        />
        <StatCard
          icon="help-circle"
          value={maybe}
          label="Maybe"
          color={Colors[scheme].warning}
        />
        <StatCard
          icon="time"
          value={pending}
          label="Pending"
          color={Colors[scheme].text.secondary}
        />
      </View>

      {showDetailedStats && (
        <View style={styles.detailedStats}>
          <View style={styles.statRow}>
            <ThemedText style={styles.statRowLabel}>Response Rate:</ThemedText>
            <ThemedText style={[styles.statRowValue, { color: Colors[scheme].primary }]}>
              {responseRate.toFixed(1)}%
            </ThemedText>
          </View>
          <View style={styles.statRow}>
            <ThemedText style={styles.statRowLabel}>Total with Plus Ones:</ThemedText>
            <ThemedText style={styles.statRowValue}>
              {totalWithPlusOnes}
            </ThemedText>
          </View>
          <View style={styles.statRow}>
            <ThemedText style={styles.statRowLabel}>Declined:</ThemedText>
            <ThemedText style={[styles.statRowValue, { color: Colors[scheme].error }]}>
              {declined}
            </ThemedText>
          </View>
        </View>
      )}

      {showAttendancePrediction && (
        <View style={styles.predictionSection}>
          <View style={styles.predictionHeader}>
            <Ionicons 
              name="analytics" 
              size={18} 
              color={Colors[scheme].primary} 
            />
            <ThemedText style={styles.predictionTitle}>Attendance Prediction</ThemedText>
          </View>
          <View style={styles.predictionContent}>
            <View style={styles.predictionRow}>
              <ThemedText style={styles.predictionLabel}>Expected Attendees:</ThemedText>
              <ThemedText style={[styles.predictionValue, { color: Colors[scheme].primary }]}>
                {Math.round(estimatedAttendance)}
              </ThemedText>
            </View>
            <View style={styles.predictionRow}>
              <ThemedText style={styles.predictionLabel}>Confirmed + 70% of Maybe:</ThemedText>
              <ThemedText style={styles.predictionSubValue}>
                {Math.round(confirmedAttendees)} people
              </ThemedText>
            </View>
            
            {/* Attendance Confidence */}
            <View style={styles.confidenceSection}>
              <ThemedText style={styles.confidenceLabel}>Prediction Confidence:</ThemedText>
              <View style={styles.confidenceBar}>
                <View style={[
                  styles.confidenceFill,
                  { 
                    width: `${Math.min(responseRate, 100)}%`,
                    backgroundColor: responseRate > 70 
                      ? Colors[scheme].success 
                      : responseRate > 40 
                        ? Colors[scheme].warning 
                        : Colors[scheme].error
                  }
                ]} />
              </View>
              <ThemedText style={styles.confidenceText}>
                {responseRate > 70 
                  ? 'High - Most people have responded' 
                  : responseRate > 40 
                    ? 'Medium - More responses needed'
                    : 'Low - Few responses so far'
                }
              </ThemedText>
            </View>
          </View>
        </View>
      )}

      {/* Planning Insights */}
      {totalInvited > 0 && (
        <View style={styles.insightsSection}>
          <ThemedText style={styles.insightsTitle}>Planning Insights</ThemedText>
          <View style={styles.insights}>
            {pending > totalInvited * 0.5 && (
              <View style={styles.insight}>
                <Ionicons name="alert-circle" size={16} color={Colors[scheme].warning} />
                <ThemedText style={styles.insightText}>
                  Many invites are still pending. Consider sending reminders.
                </ThemedText>
              </View>
            )}
            {responseRate > 80 && (
              <View style={styles.insight}>
                <Ionicons name="checkmark-circle" size={16} color={Colors[scheme].success} />
                <ThemedText style={styles.insightText}>
                  Great response rate! Your attendance estimate is reliable.
                </ThemedText>
              </View>
            )}
            {plusOnes > accepted * 0.3 && (
              <View style={styles.insight}>
                <Ionicons name="people" size={16} color={Colors[scheme].primary} />
                <ThemedText style={styles.insightText}>
                  High plus-one rate. Plan for extra capacity.
                </ThemedText>
              </View>
            )}
            {maybe > accepted && (
              <View style={styles.insight}>
                <Ionicons name="help-circle" size={16} color={Colors[scheme].warning} />
                <ThemedText style={styles.insightText}>
                  Many "maybe" responses. Follow up closer to the event date.
                </ThemedText>
              </View>
            )}
          </View>
        </View>
      )}
    </Card>
  );
};

const createStyles = (scheme: 'light' | 'dark') => StyleSheet.create({
  container: {
    padding: Spacing.md,
  },
  title: {
    ...Typography.h3,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  progressBar: {
    marginBottom: Spacing.lg,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  statCard: {
    width: '48%',
    backgroundColor: Colors[scheme].background.secondary,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    alignItems: 'center',
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  statValue: {
    ...Typography.h2,
    fontWeight: 'bold',
    marginLeft: Spacing.xs,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors[scheme].text.secondary,
    textAlign: 'center',
  },
  statSubValue: {
    ...Typography.caption,
    color: Colors[scheme].text.tertiary,
    fontSize: 10,
    marginTop: Spacing.xs,
  },
  detailedStats: {
    backgroundColor: Colors[scheme].background.secondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  statRowLabel: {
    ...Typography.body,
    color: Colors[scheme].text.secondary,
  },
  statRowValue: {
    ...Typography.body,
    fontWeight: '600',
  },
  predictionSection: {
    backgroundColor: Colors[scheme].background.secondary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  predictionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  predictionTitle: {
    ...Typography.h4,
    marginLeft: Spacing.sm,
  },
  predictionContent: {
    marginTop: Spacing.sm,
  },
  predictionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  predictionLabel: {
    ...Typography.body,
    color: Colors[scheme].text.secondary,
  },
  predictionValue: {
    ...Typography.h3,
    fontWeight: 'bold',
  },
  predictionSubValue: {
    ...Typography.body,
    color: Colors[scheme].text.tertiary,
  },
  confidenceSection: {
    marginTop: Spacing.md,
  },
  confidenceLabel: {
    ...Typography.body,
    color: Colors[scheme].text.secondary,
    marginBottom: Spacing.sm,
  },
  confidenceBar: {
    height: 6,
    backgroundColor: Colors[scheme].border,
    borderRadius: BorderRadius.xs,
    marginBottom: Spacing.sm,
  },
  confidenceFill: {
    height: '100%',
    borderRadius: BorderRadius.xs,
  },
  confidenceText: {
    ...Typography.caption,
    color: Colors[scheme].text.secondary,
  },
  insightsSection: {
    marginTop: Spacing.sm,
  },
  insightsTitle: {
    ...Typography.h4,
    marginBottom: Spacing.sm,
  },
  insights: {
    gap: Spacing.sm,
  },
  insight: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors[scheme].background.secondary,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  insightText: {
    ...Typography.caption,
    marginLeft: Spacing.sm,
    flex: 1,
    color: Colors[scheme].text.secondary,
  },
});

export default RSVPSummary;