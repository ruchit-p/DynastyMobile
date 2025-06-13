import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/Colors';
import { Typography } from '@/constants/Typography';
import { Spacing, BorderRadius } from '@/constants/Spacing';
import { useColorScheme } from '@/hooks/useColorScheme';

export interface RSVPStatusIndicatorProps {
  status: 'pending' | 'accepted' | 'declined' | 'maybe';
  size?: 'small' | 'medium' | 'large';
  showText?: boolean;
  style?: any;
}

export interface RSVPProgressBarProps {
  totalInvited: number;
  accepted: number;
  declined: number;
  maybe: number;
  pending: number;
  showCounts?: boolean;
  style?: any;
}

export interface RSVPDeadlineCountdownProps {
  deadline: Date | string;
  style?: any;
}

const RSVPStatusIndicator: React.FC<RSVPStatusIndicatorProps> = ({
  status,
  size = 'medium',
  showText = true,
  style
}) => {
  const colorScheme = useColorScheme();
  const scheme = colorScheme ?? 'light';
  const styles = createStyles(scheme);

  const getStatusConfig = () => {
    switch (status) {
      case 'accepted':
        return {
          icon: 'checkmark-circle',
          color: Colors[scheme].success,
          text: 'Going',
          backgroundColor: Colors[scheme].background.success || `${Colors[scheme].success}15`
        };
      case 'declined':
        return {
          icon: 'close-circle',
          color: Colors[scheme].error,
          text: "Can't Go",
          backgroundColor: Colors[scheme].background.error || `${Colors[scheme].error}15`
        };
      case 'maybe':
        return {
          icon: 'help-circle',
          color: Colors[scheme].warning,
          text: 'Maybe',
          backgroundColor: Colors[scheme].background.warning || `${Colors[scheme].warning}15`
        };
      case 'pending':
      default:
        return {
          icon: 'time',
          color: Colors[scheme].text.secondary,
          text: 'Pending',
          backgroundColor: Colors[scheme].background.secondary
        };
    }
  };

  const getSizeConfig = () => {
    switch (size) {
      case 'small':
        return { iconSize: 16, padding: Spacing.xs, textStyle: Typography.caption };
      case 'large':
        return { iconSize: 24, padding: Spacing.md, textStyle: Typography.body };
      case 'medium':
      default:
        return { iconSize: 20, padding: Spacing.sm, textStyle: Typography.body };
    }
  };

  const statusConfig = getStatusConfig();
  const sizeConfig = getSizeConfig();

  return (
    <View style={[
      styles.container,
      {
        backgroundColor: statusConfig.backgroundColor,
        paddingHorizontal: sizeConfig.padding,
        paddingVertical: sizeConfig.padding * 0.7,
      },
      style
    ]}>
      <Ionicons 
        name={statusConfig.icon as any} 
        size={sizeConfig.iconSize} 
        color={statusConfig.color} 
      />
      {showText && (
        <ThemedText style={[
          sizeConfig.textStyle,
          { color: statusConfig.color, marginLeft: Spacing.xs, fontWeight: '500' }
        ]}>
          {statusConfig.text}
        </ThemedText>
      )}
    </View>
  );
};

export const RSVPProgressBar: React.FC<RSVPProgressBarProps> = ({
  totalInvited,
  accepted,
  declined,
  maybe,
  pending,
  showCounts = true,
  style
}) => {
  const colorScheme = useColorScheme();
  const scheme = colorScheme ?? 'light';
  const styles = createProgressStyles(scheme);

  const acceptedPercentage = totalInvited > 0 ? (accepted / totalInvited) * 100 : 0;
  const declinedPercentage = totalInvited > 0 ? (declined / totalInvited) * 100 : 0;
  const maybePercentage = totalInvited > 0 ? (maybe / totalInvited) * 100 : 0;
  const pendingPercentage = totalInvited > 0 ? (pending / totalInvited) * 100 : 0;

  return (
    <View style={[styles.container, style]}>
      {showCounts && (
        <View style={styles.countsRow}>
          <ThemedText style={styles.totalText}>{accepted + maybe} / {totalInvited} responded</ThemedText>
          <ThemedText style={styles.percentageText}>
            {totalInvited > 0 ? Math.round(((accepted + maybe) / totalInvited) * 100) : 0}%
          </ThemedText>
        </View>
      )}
      
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBar}>
          {acceptedPercentage > 0 && (
            <View style={[
              styles.progressSegment,
              {
                width: `${acceptedPercentage}%`,
                backgroundColor: Colors[scheme].success
              }
            ]} />
          )}
          {maybePercentage > 0 && (
            <View style={[
              styles.progressSegment,
              {
                width: `${maybePercentage}%`,
                backgroundColor: Colors[scheme].warning
              }
            ]} />
          )}
          {declinedPercentage > 0 && (
            <View style={[
              styles.progressSegment,
              {
                width: `${declinedPercentage}%`,
                backgroundColor: Colors[scheme].error
              }
            ]} />
          )}
          {pendingPercentage > 0 && (
            <View style={[
              styles.progressSegment,
              {
                width: `${pendingPercentage}%`,
                backgroundColor: Colors[scheme].text.secondary
              }
            ]} />
          )}
        </View>
      </View>

      {showCounts && (
        <View style={styles.legendRow}>
          {accepted > 0 && (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors[scheme].success }]} />
              <ThemedText style={styles.legendText}>Going ({accepted})</ThemedText>
            </View>
          )}
          {maybe > 0 && (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors[scheme].warning }]} />
              <ThemedText style={styles.legendText}>Maybe ({maybe})</ThemedText>
            </View>
          )}
          {declined > 0 && (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors[scheme].error }]} />
              <ThemedText style={styles.legendText}>Can&apos;t Go ({declined})</ThemedText>
            </View>
          )}
          {pending > 0 && (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors[scheme].text.secondary }]} />
              <ThemedText style={styles.legendText}>Pending ({pending})</ThemedText>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

export const RSVPDeadlineCountdown: React.FC<RSVPDeadlineCountdownProps> = ({
  deadline,
  style
}) => {
  const colorScheme = useColorScheme();
  const scheme = colorScheme ?? 'light';
  const styles = createCountdownStyles(scheme);

  const [timeLeft, setTimeLeft] = React.useState<string>('');
  const [isUrgent, setIsUrgent] = React.useState(false);
  const [isPastDue, setIsPastDue] = React.useState(false);

  React.useEffect(() => {
    const calculateTimeLeft = () => {
      const deadlineDate = typeof deadline === 'string' ? new Date(deadline) : deadline;
      const now = new Date();
      const difference = deadlineDate.getTime() - now.getTime();

      if (difference <= 0) {
        setIsPastDue(true);
        setTimeLeft('Past due');
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));

      // Mark as urgent if less than 24 hours remain
      setIsUrgent(difference < 24 * 60 * 60 * 1000);

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m`);
      } else {
        setTimeLeft(`${minutes}m`);
      }
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [deadline]);

  const getContainerStyle = () => {
    if (isPastDue) {
      return [styles.container, styles.pastDueContainer];
    } else if (isUrgent) {
      return [styles.container, styles.urgentContainer];
    }
    return [styles.container, styles.normalContainer];
  };

  const getTextColor = () => {
    if (isPastDue) return Colors[scheme].error;
    if (isUrgent) return Colors[scheme].warning;
    return Colors[scheme].text.secondary;
  };

  return (
    <View style={[getContainerStyle(), style]}>
      <Ionicons 
        name={isPastDue ? "alert-circle" : isUrgent ? "time" : "calendar"} 
        size={16} 
        color={getTextColor()} 
      />
      <ThemedText style={[styles.text, { color: getTextColor() }]}>
        {isPastDue ? 'RSVP deadline passed' : `RSVP in ${timeLeft}`}
      </ThemedText>
    </View>
  );
};

const createStyles = (scheme: 'light' | 'dark') => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
  },
});

const createProgressStyles = (scheme: 'light' | 'dark') => StyleSheet.create({
  container: {
    marginVertical: Spacing.sm,
  },
  countsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  totalText: {
    ...Typography.body,
    fontWeight: '500',
  },
  percentageText: {
    ...Typography.body,
    color: Colors[scheme].primary,
    fontWeight: '600',
  },
  progressBarContainer: {
    marginBottom: Spacing.sm,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors[scheme].background.secondary,
    borderRadius: BorderRadius.sm,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  progressSegment: {
    height: '100%',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: Spacing.md,
    marginTop: Spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.xs,
  },
  legendText: {
    ...Typography.caption,
    color: Colors[scheme].text.secondary,
  },
});

const createCountdownStyles = (scheme: 'light' | 'dark') => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  normalContainer: {
    backgroundColor: Colors[scheme].background.secondary,
  },
  urgentContainer: {
    backgroundColor: Colors[scheme].background.warning || `${Colors[scheme].warning}15`,
    borderWidth: 1,
    borderColor: Colors[scheme].warning,
  },
  pastDueContainer: {
    backgroundColor: Colors[scheme].background.error || `${Colors[scheme].error}15`,
    borderWidth: 1,
    borderColor: Colors[scheme].error,
  },
  text: {
    ...Typography.caption,
    marginLeft: Spacing.xs,
    fontWeight: '500',
  },
});

export default RSVPStatusIndicator;