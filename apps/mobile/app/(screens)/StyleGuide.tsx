import React, { useEffect, useCallback } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  SafeAreaView,
  TouchableOpacity
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';

// Import design system
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { Spacing, BorderRadius, Shadows, Layout } from '../../constants/Spacing';
import { useColorScheme } from '../../hooks/useColorScheme';
import { 
  useTextColor, 
  useBackgroundColor, 
  useBorderColor 
} from '../../hooks/useThemeColor';

// Define FontWeight if it's missing
const FontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700'
};

const StyleGuide = () => {
  const { handleError, withErrorHandling: withErrorHandlingHook, reset } = useErrorHandler({
    severity: ErrorSeverity.INFO,
    title: 'Style Guide Error',
    trackCurrentScreen: true
  });

  const colorScheme = useColorScheme();
  const theme = colorScheme || 'light';
  
  // Get theme-aware colors
  const textColor = useTextColor();
  const backgroundColor = useBackgroundColor('secondary');
  const borderColor = useBorderColor();

  // Reset error state on mount/unmount
  useEffect(() => {
    reset();
    return () => reset();
  }, [reset]);

  // Example of wrapping an async function with error handling
  const loadStyleGuideData = withErrorHandlingHook(async () => {
    // Simulate loading style guide data
    await new Promise(resolve => setTimeout(resolve, 100));
    return { theme, colors: Colors, typography: Typography };
  });

  // Initialize data on mount
  useEffect(() => {
    const initializeData = async () => {
      try {
        await loadStyleGuideData();
      } catch (error) {
        handleError(error, { 
          action: 'initializeData',
          component: 'StyleGuide'
        });
      }
    };
    
    initializeData();
  }, [loadStyleGuideData, handleError]);

  // Sample color block with error handling
  const ColorBlock = useCallback(({ name, color, textColor = 'white' }) => {
    try {
      return (
        <View style={styles.colorBlockContainer}>
          <View style={[styles.colorBlock, { backgroundColor: color }]}>
            <Text style={[styles.colorBlockText, { color: textColor }]}>{name}</Text>
          </View>
        </View>
      );
    } catch (error) {
      handleError(error, { 
        component: 'ColorBlock', 
        name, 
        color, 
        textColor 
      });
      return (
        <View style={styles.colorBlockContainer}>
          <View style={[styles.colorBlock, { backgroundColor: '#ccc' }]}>
            <Text style={[styles.colorBlockText, { color: 'black' }]}>Error</Text>
          </View>
        </View>
      );
    }
  }, [handleError]);

  // Sample text style with error handling
  const TextStyleItem = useCallback(({ name, style }) => {
    try {
      return (
        <View style={styles.textStyleContainer}>
          <Text style={styles.textStyleName}>{name}</Text>
          <Text style={style}>The quick brown fox jumps over the lazy dog</Text>
        </View>
      );
    } catch (error) {
      handleError(error, { 
        component: 'TextStyleItem', 
        name, 
        style: JSON.stringify(style) 
      });
      return (
        <View style={styles.textStyleContainer}>
          <Text style={styles.textStyleName}>{name} - Error</Text>
          <Text style={{ color: 'red' }}>Failed to render text style</Text>
        </View>
      );
    }
  }, [handleError]);

  // Sample spacing block with error handling
  const SpacingBlock = useCallback(({ name, size }) => {
    try {
      return (
        <View style={styles.spacingContainer}>
          <Text style={styles.spacingName}>{name}</Text>
          <View style={[styles.spacingBlock, { width: size, height: size }]} />
          <Text style={styles.spacingValue}>{size}px</Text>
        </View>
      );
    } catch (error) {
      handleError(error, { 
        component: 'SpacingBlock', 
        name, 
        size 
      });
      return (
        <View style={styles.spacingContainer}>
          <Text style={styles.spacingName}>{name} - Error</Text>
          <View style={[styles.spacingBlock, { width: 20, height: 20 }]} />
          <Text style={styles.spacingValue}>Error</Text>
        </View>
      );
    }
  }, [handleError]);

  // Sample shadow block with error handling
  const ShadowBlock = useCallback(({ name, shadow }) => {
    try {
      return (
        <View style={styles.shadowContainer}>
          <Text style={styles.shadowName}>{name}</Text>
          <View style={[styles.shadowBox, shadow]} />
        </View>
      );
    } catch (error) {
      handleError(error, { 
        component: 'ShadowBlock', 
        name, 
        shadow: JSON.stringify(shadow) 
      });
      return (
        <View style={styles.shadowContainer}>
          <Text style={styles.shadowName}>{name} - Error</Text>
          <View style={styles.shadowBox} />
        </View>
      );
    }
  }, [handleError]);

  return (
    <ErrorBoundary screenName="StyleGuideScreen">
      <SafeAreaView style={[styles.container, { backgroundColor }]}>
        <Stack.Screen 
          options={{ 
            title: 'Design System',
            headerTitleStyle: { 
              color: Colors.palette.dynastyGreen.dark,
              fontWeight: 'bold'
            }
          }} 
        />
        
        <ScrollView style={styles.scrollView}>
        <View style={[styles.section, { borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Colors</Text>
          
          <Text style={[styles.sectionSubtitle, { color: textColor }]}>Primary</Text>
          <View style={styles.colorRow}>
            <ColorBlock name="Dynasty Dark" color={Colors.palette.dynastyGreen.dark} />
            <ColorBlock name="Dynasty Medium" color={Colors.palette.dynastyGreen.medium} />
            <ColorBlock name="Dynasty Light" color={Colors.palette.dynastyGreen.light} textColor="black" />
            <ColorBlock name="Dynasty Extra Light" color={Colors.palette.dynastyGreen.extraLight} textColor="black" />
          </View>
          
          <Text style={[styles.sectionSubtitle, { color: textColor }]}>Neutrals</Text>
          <View style={styles.colorRow}>
            <ColorBlock name="Black" color={Colors.palette.neutral.black} />
            <ColorBlock name="Darkest" color={Colors.palette.neutral.darkest} />
            <ColorBlock name="Dark" color={Colors.palette.neutral.dark} />
            <ColorBlock name="Medium" color={Colors.palette.neutral.medium} />
          </View>
          <View style={styles.colorRow}>
            <ColorBlock name="Light" color={Colors.palette.neutral.light} textColor="black" />
            <ColorBlock name="Lighter" color={Colors.palette.neutral.lighter} textColor="black" />
            <ColorBlock name="Lightest" color={Colors.palette.neutral.lightest} textColor="black" />
            <ColorBlock name="White" color={Colors.palette.neutral.white} textColor="black" />
          </View>
          
          <Text style={[styles.sectionSubtitle, { color: textColor }]}>Status</Text>
          <View style={styles.colorRow}>
            <ColorBlock name="Success" color={Colors.palette.status.success} />
            <ColorBlock name="Warning" color={Colors.palette.status.warning} textColor="black" />
            <ColorBlock name="Error" color={Colors.palette.status.error} />
            <ColorBlock name="Info" color={Colors.palette.status.info} />
          </View>
          
          <Text style={[styles.sectionSubtitle, { color: textColor }]}>Semantic Colors (Current Theme: {theme})</Text>
          <View style={styles.colorRow}>
            <ColorBlock name="Text Primary" color={Colors[theme].text.primary} textColor={theme === 'dark' ? 'black' : 'white'} />
            <ColorBlock name="Background" color={Colors[theme].background.primary} textColor={theme === 'dark' ? 'white' : 'black'} />
            <ColorBlock name="Button Primary" color={Colors[theme].button.primary.background} />
            <ColorBlock name="Icon Primary" color={Colors[theme].icon.primary} textColor={theme === 'dark' ? 'black' : 'white'} />
          </View>
        </View>
        
        <View style={[styles.section, { borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Typography</Text>
          
          <Text style={[styles.sectionSubtitle, { color: textColor }]}>Headings</Text>
          <TextStyleItem name="Heading 1" style={[Typography.styles.heading1, { color: textColor }]} />
          <TextStyleItem name="Heading 2" style={[Typography.styles.heading2, { color: textColor }]} />
          <TextStyleItem name="Heading 3" style={[Typography.styles.heading3, { color: textColor }]} />
          <TextStyleItem name="Heading 4" style={[Typography.styles.heading4, { color: textColor }]} />
          <TextStyleItem name="Heading 5" style={[Typography.styles.heading5, { color: textColor }]} />
          
          <Text style={[styles.sectionSubtitle, { color: textColor }]}>Body</Text>
          <TextStyleItem name="Body Large" style={[Typography.styles.bodyLarge, { color: textColor }]} />
          <TextStyleItem name="Body Medium" style={[Typography.styles.bodyMedium, { color: textColor }]} />
          <TextStyleItem name="Body Small" style={[Typography.styles.bodySmall, { color: textColor }]} />
          
          <Text style={[styles.sectionSubtitle, { color: textColor }]}>Other</Text>
          <TextStyleItem name="Caption" style={[Typography.styles.caption, { color: textColor }]} />
          <TextStyleItem name="Button" style={[Typography.styles.button, { color: textColor }]} />
          <TextStyleItem name="Link" style={[Typography.styles.link, { color: Colors[theme].text.link }]} />
        </View>
        
        <View style={[styles.section, { borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Spacing</Text>
          
          <View style={styles.spacingRow}>
            <SpacingBlock name="XXS" size={Spacing.xxs} />
            <SpacingBlock name="XS" size={Spacing.xs} />
            <SpacingBlock name="SM" size={Spacing.sm} />
            <SpacingBlock name="MD" size={Spacing.md} />
          </View>
          <View style={styles.spacingRow}>
            <SpacingBlock name="LG" size={Spacing.lg} />
            <SpacingBlock name="XL" size={Spacing.xl} />
            <SpacingBlock name="2XL" size={Spacing['2xl']} />
          </View>
        </View>
        
        <View style={[styles.section, { borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Border Radius</Text>
          
          <View style={styles.radiusRow}>
            {Object.entries(BorderRadius).map(([name, value]) => (
              name !== 'full' && (
                <View key={name} style={styles.radiusContainer}>
                  <Text style={styles.radiusName}>{name.toUpperCase()}</Text>
                  <View 
                    style={[
                      styles.radiusBlock, 
                      { borderRadius: value as number },
                      { borderColor }
                    ]} 
                  />
                  <Text style={styles.radiusValue}>{value}px</Text>
                </View>
              )
            ))}
          </View>
          <View style={styles.radiusContainer}>
            <Text style={styles.radiusName}>FULL</Text>
            <View 
              style={[
                styles.radiusCircle, 
                { borderRadius: BorderRadius.full },
                { borderColor }
              ]} 
            />
            <Text style={styles.radiusValue}>Full</Text>
          </View>
        </View>
        
        <View style={[styles.section, { borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Shadows</Text>
          
          <View style={styles.shadowRow}>
            <ShadowBlock name="XS" shadow={Shadows.xs} />
            <ShadowBlock name="SM" shadow={Shadows.sm} />
            <ShadowBlock name="MD" shadow={Shadows.md} />
          </View>
          <View style={styles.shadowRow}>
            <ShadowBlock name="LG" shadow={Shadows.lg} />
            <ShadowBlock name="XL" shadow={Shadows.xl} />
          </View>
        </View>
        
        <View style={[styles.section, { borderColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Button Examples</Text>
          
          <View style={styles.buttonRow}>
            <TouchableOpacity 
              style={[
                styles.buttonExample, 
                styles.primaryButton, 
                { backgroundColor: Colors[theme].button.primary.background }
              ]}
              onPress={() => {
                try {
                  // Placeholder for button action
                } catch (error) {
                  handleError(error, { 
                    component: 'PrimaryButton', 
                    action: 'onPress' 
                  });
                }
              }}
            >
              <Text style={[styles.buttonText, { color: Colors[theme].button.primary.text }]}>
                Primary
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.buttonExample, 
                styles.secondaryButton,
                { 
                  backgroundColor: Colors[theme].button.secondary.background,
                  borderColor: Colors[theme].button.primary.background
                }
              ]}
              onPress={() => {
                try {
                  // Placeholder for button action
                } catch (error) {
                  handleError(error, { 
                    component: 'PrimaryButton', 
                    action: 'onPress' 
                  });
                }
              }}
            >
              <Text style={[styles.buttonText, { color: Colors[theme].button.secondary.text }]}>
                Secondary
              </Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.buttonRow}>
            <TouchableOpacity 
              style={[styles.buttonExample, styles.textButton]}
              onPress={() => {
                try {
                  // Placeholder for button action
                } catch (error) {
                  handleError(error, { 
                    component: 'PrimaryButton', 
                    action: 'onPress' 
                  });
                }
              }}
            >
              <Text style={[styles.buttonText, { color: Colors[theme].text.link }]}>
                Text Button
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.buttonExample, 
                styles.iconButton,
                { backgroundColor: Colors[theme].button.primary.background }
              ]}
              onPress={() => {
                try {
                  // Placeholder for button action
                } catch (error) {
                  handleError(error, { 
                    component: 'PrimaryButton', 
                    action: 'onPress' 
                  });
                }
              }}
            >
              <Ionicons name="add" size={24} color={Colors[theme].button.primary.text} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    padding: Layout.screenPadding,
  },
  section: {
    marginBottom: Spacing.xl,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    ...Typography.styles.heading3,
    marginBottom: Spacing.md,
  },
  sectionSubtitle: {
    ...Typography.styles.heading5,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: Spacing.sm,
  },
  colorBlockContainer: {
    width: '25%',
    padding: Spacing.xs,
  },
  colorBlock: {
    height: 80,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xs,
  },
  colorBlockText: {
    fontSize: Typography.size.xs,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
  },
  textStyleContainer: {
    marginBottom: Spacing.md,
  },
  textStyleName: {
    ...Typography.styles.caption,
    color: Colors.palette.neutral.medium,
    marginBottom: Spacing.xs,
  },
  spacingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: Spacing.md,
  },
  spacingContainer: {
    marginRight: Spacing.lg,
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  spacingName: {
    ...Typography.styles.caption,
    color: Colors.palette.neutral.medium,
    marginBottom: Spacing.xs,
  },
  spacingBlock: {
    backgroundColor: Colors.palette.dynastyGreen.medium,
    marginBottom: Spacing.xs,
  },
  spacingValue: {
    ...Typography.styles.caption,
    color: Colors.palette.neutral.medium,
  },
  radiusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  radiusContainer: {
    marginRight: Spacing.lg,
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  radiusName: {
    ...Typography.styles.caption,
    color: Colors.palette.neutral.medium,
    marginBottom: Spacing.xs,
  },
  radiusBlock: {
    width: 60,
    height: 60,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  radiusCircle: {
    width: 60,
    height: 60,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  radiusValue: {
    ...Typography.styles.caption,
    color: Colors.palette.neutral.medium,
  },
  shadowRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: Spacing.md,
  },
  shadowContainer: {
    marginRight: Spacing.lg,
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  shadowName: {
    ...Typography.styles.caption,
    color: Colors.palette.neutral.medium,
    marginBottom: Spacing.xs,
  },
  shadowBox: {
    width: 70,
    height: 70,
    backgroundColor: Colors.palette.neutral.white,
    marginBottom: Spacing.xs,
  },
  buttonRow: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  buttonExample: {
    marginRight: Spacing.md,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    minWidth: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButton: {
    ...Shadows.sm,
  },
  secondaryButton: {
    borderWidth: 1,
  },
  textButton: {
    backgroundColor: 'transparent',
  },
  iconButton: {
    width: 50,
    height: 50,
    borderRadius: BorderRadius.full,
    minWidth: 0,
  },
  buttonText: {
    ...Typography.styles.button,
  },
});

export default StyleGuide;