import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import { Typography } from '../../constants/Typography';
import { logger } from '../../src/services/LoggingService';

interface MigrationStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
}

interface EncryptionMigrationProgressProps {
  visible: boolean;
  onComplete: () => void;
  onError: (error: Error) => void;
}

export const EncryptionMigrationProgress: React.FC<EncryptionMigrationProgressProps> = ({
  visible,
  onComplete,
  onError,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<MigrationStep[]>([
    {
      id: 'generate-keys',
      title: 'Generating Encryption Keys',
      description: 'Creating secure Signal Protocol keys',
      status: 'pending',
    },
    {
      id: 'backup-data',
      title: 'Backing Up Messages',
      description: 'Saving your existing messages',
      status: 'pending',
    },
    {
      id: 'migrate-messages',
      title: 'Migrating Messages',
      description: 'Converting to new encryption format',
      status: 'pending',
    },
    {
      id: 'publish-keys',
      title: 'Publishing Keys',
      description: 'Making keys available for contacts',
      status: 'pending',
    },
    {
      id: 'verify-migration',
      title: 'Verifying Migration',
      description: 'Ensuring everything is secure',
      status: 'pending',
    },
  ]);

  const progressAnimation = useState(new Animated.Value(0))[0];

  useEffect(() => {
    if (visible) {
      startMigration();
    }
  }, [visible]);

  useEffect(() => {
    // Animate progress bar
    Animated.timing(progressAnimation, {
      toValue: (currentStep / steps.length) * 100,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [currentStep]);

  const startMigration = async () => {
    try {
      for (let i = 0; i < steps.length; i++) {
        await performStep(i);
      }
      
      // Migration complete
      setTimeout(() => {
        onComplete();
      }, 1000);
    } catch (error) {
      logger.error('Migration failed:', error);
      onError(error as Error);
    }
  };

  const performStep = async (stepIndex: number) => {
    // Update step status to in-progress
    setSteps(prev => {
      const newSteps = [...prev];
      newSteps[stepIndex].status = 'in-progress';
      return newSteps;
    });
    setCurrentStep(stepIndex);

    // Simulate step execution (in real implementation, this would call actual migration functions)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Update step status to completed
    setSteps(prev => {
      const newSteps = [...prev];
      newSteps[stepIndex].status = 'completed';
      return newSteps;
    });
  };

  const renderStep = (step: MigrationStep, index: number) => {
    const isActive = index === currentStep;
    const isCompleted = step.status === 'completed';
    const isPending = step.status === 'pending';

    return (
      <View key={step.id} style={styles.step}>
        <View style={styles.stepIndicator}>
          {isCompleted ? (
            <View style={styles.stepCompleted}>
              <Ionicons name="checkmark" size={16} color="white" />
            </View>
          ) : isActive ? (
            <ActivityIndicator size="small" color={Colors.light.primary} />
          ) : (
            <View style={[styles.stepPending, isPending && styles.stepPendingInactive]} />
          )}
        </View>
        
        <View style={styles.stepContent}>
          <Text style={[
            styles.stepTitle,
            isActive && styles.stepTitleActive,
            isCompleted && styles.stepTitleCompleted,
          ]}>
            {step.title}
          </Text>
          <Text style={[
            styles.stepDescription,
            isActive && styles.stepDescriptionActive,
          ]}>
            {step.description}
          </Text>
        </View>
      </View>
    );
  };

  const progress = (currentStep / steps.length) * 100;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons
                name="shield-checkmark"
                size={48}
                color={Colors.light.primary}
              />
            </View>
            <Text style={styles.title}>Upgrading Encryption</Text>
            <Text style={styles.subtitle}>
              We&apos;re upgrading your messages to use Signal Protocol for enhanced security
            </Text>
          </View>

          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progressAnimation.interpolate({
                      inputRange: [0, 100],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>{Math.round(progress)}%</Text>
          </View>

          <View style={styles.steps}>
            {steps.map((step, index) => renderStep(step, index))}
          </View>

          <View style={styles.footer}>
            <Ionicons
              name="lock-closed"
              size={16}
              color={Colors.light.text.secondary}
            />
            <Text style={styles.footerText}>
              Your messages remain encrypted during this process
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  container: {
    backgroundColor: Colors.light.background.primary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.light.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.styles.heading3,
    color: Colors.light.text.primary,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.secondary,
    textAlign: 'center',
  },
  progressContainer: {
    marginBottom: Spacing.xl,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.light.background.secondary,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.light.primary,
    borderRadius: BorderRadius.full,
  },
  progressText: {
    ...Typography.styles.caption,
    color: Colors.light.text.secondary,
    textAlign: 'center',
  },
  steps: {
    marginBottom: Spacing.xl,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  stepIndicator: {
    width: 24,
    height: 24,
    marginRight: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCompleted: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.light.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPending: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderColor: Colors.light.primary,
  },
  stepPendingInactive: {
    borderColor: Colors.light.border,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.secondary,
    marginBottom: Spacing.xs,
  },
  stepTitleActive: {
    color: Colors.light.text.primary,
    fontWeight: '600',
  },
  stepTitleCompleted: {
    color: Colors.light.success,
  },
  stepDescription: {
    ...Typography.styles.caption,
    color: Colors.light.text.tertiary,
  },
  stepDescriptionActive: {
    color: Colors.light.text.secondary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  footerText: {
    ...Typography.styles.caption,
    color: Colors.light.text.secondary,
    marginLeft: Spacing.xs,
  },
});