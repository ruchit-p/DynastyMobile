# Dynasty Mobile Design System

This design system provides a unified approach to building UI components and screens for the Dynasty Mobile app. It ensures consistency across the app and helps speed up development by providing ready-to-use components and styles.

## Core Principles

1. **Consistency**: Unified look and feel across the entire app
2. **Reusability**: Components are designed to be reused in different contexts
3. **Flexibility**: Customizable while still maintaining design coherence
4. **Accessibility**: Components are built with accessibility in mind

## Design Tokens

### Colors

The color system consists of:

- **Palette**: Raw color values
- **Semantic colors**: Usage-based naming for light and dark themes
- **Legacy support**: For backward compatibility

Usage:

```typescript
import { Colors } from '../constants/Colors';

// Using semantic colors (preferred)
const primaryTextColor = Colors.light.text.primary;
const buttonBackground = Colors.dark.button.primary.background;

// Direct access to palette
const dynastyGreen = Colors.palette.dynastyGreen.dark;

// Legacy access (for backward compatibility)
const legacyTint = Colors.light_legacy.tint;
```

For theme-aware color access, use the enhanced hooks:

```typescript
import { useTextColor, useBackgroundColor } from '../hooks/useThemeColor';

function MyComponent() {
  const textColor = useTextColor('primary');
  const backgroundColor = useBackgroundColor('secondary');
  
  // ...
}
```

### Typography

The typography system provides consistent text styles:

- **Font families**
- **Font sizes**
- **Font weights**
- **Line heights**
- **Precomposed text styles**

Usage:

```typescript
import Typography from '../constants/Typography';

// Using precomposed styles (preferred)
const headingStyle = Typography.styles.heading1;
const bodyStyle = Typography.styles.bodyMedium;

// Direct access to typography values
const largeFontSize = Typography.size.xl;
const boldWeight = Typography.weight.bold;
```

For consistent text rendering, use the ThemedText component:

```tsx
import ThemedText from '../components/ThemedText';

function MyComponent() {
  return (
    <ThemedText variant="h1" color="primary">
      Hello World
    </ThemedText>
  );
}
```

### Spacing

The spacing system provides consistent spacing values:

- **Spacing scale**
- **Border radius values**
- **Shadow definitions**
- **Layout constants**

Usage:

```typescript
import { Spacing, BorderRadius, Shadows, Layout } from '../constants/Spacing';

// Using spacing values
const paddingValue = Spacing.md;
const marginValue = Spacing.lg;

// Using border radius
const cornerRadius = BorderRadius.md;

// Using shadows
const cardShadow = Shadows.sm;

// Using layout constants
const screenPadding = Layout.screenPadding;
```

## Core Components

### ThemedText

Text component with theme awareness and typography styles.

```tsx
<ThemedText variant="h1" color="primary">Heading</ThemedText>
<ThemedText variant="bodyMedium" color="secondary">Body text</ThemedText>
<ThemedText variant="link" onPress={handlePress}>Link text</ThemedText>
```

### ThemedView

View component with theme awareness and styling variants.

```tsx
<ThemedView variant="card" shadow="md">Card content</ThemedView>
<ThemedView variant="surface">Surface content</ThemedView>
```

### Button

Versatile button component with multiple variants and states.

```tsx
<Button 
  title="Primary Button" 
  onPress={handlePress} 
  variant="primary"
  size="medium"
/>

<Button 
  title="Text Button" 
  onPress={handlePress} 
  variant="text"
  leftIcon="arrow-back"
/>

<Button 
  iconOnly="add"
  onPress={handlePress} 
  size="large"
/>
```

### Card

Container for grouping related content.

```tsx
<Card variant="elevated" shadow="md">
  <Card.Header>
    <ThemedText variant="h4">Card Title</ThemedText>
  </Card.Header>
  <Card.Content>
    <ThemedText variant="bodyMedium">Card content goes here</ThemedText>
  </Card.Content>
  <Card.Footer>
    <Button title="Action" onPress={handlePress} variant="text" />
  </Card.Footer>
</Card>
```

### Avatar

Component for displaying user profile images.

```tsx
<Avatar 
  source="https://example.com/avatar.jpg" 
  size="md" 
  editable={true}
  onPress={handleEditAvatar}
/>
```

### EmptyState

Component for displaying when content is unavailable.

```tsx
<EmptyState
  icon="document-text-outline"
  title="No Documents"
  description="You don't have any documents yet."
  actionLabel="Create Document"
  onAction={handleCreateDocument}
/>
```

### Screen

Wrapper component for consistent screen layout.

```tsx
<Screen 
  safeArea={true} 
  padding={true}
  scroll={true}
  keyboardAvoid={true}
>
  <YourScreenContent />
</Screen>
```

## How to Use the Design System

1. **Start with Screen**: Wrap your screen content with the Screen component
2. **Use Core Components**: Leverage the provided components for consistent UI
3. **Apply Theme Colors**: Use the theming hooks for color consistency
4. **Follow Typography Guidelines**: Use ThemedText with appropriate variants
5. **Maintain Spacing Consistency**: Use the spacing constants for layout

## Style Guide

For a visual reference of the design system, navigate to the StyleGuide screen:

```tsx
import { router } from 'expo-router';

// Navigate to the style guide
router.push('/(screens)/StyleGuide');
```

This will show all the design tokens and components in action for both light and dark themes.
