# Dynasty Mobile UI Component Library

A comprehensive UI component library for the Dynasty Mobile app, built on a consistent design system.

## Core Components

### Screen

A wrapper component for screens with consistent styling and layout options.

```tsx
import Screen from '../../components/ui/Screen';

<Screen
  safeArea={true}
  padding={true}
  scroll={{
    enabled: true,
    refreshing: isRefreshing,
    onRefresh: handleRefresh,
  }}
  keyboardAvoid={true}
>
  {/* Your screen content */}
</Screen>
```

### ThemedText

Text component with theme awareness and typography styles.

```tsx
import ThemedText from '../../components/ThemedText';

<ThemedText variant="h1" color="primary">Heading</ThemedText>
<ThemedText variant="bodyMedium" color="secondary">Body text</ThemedText>
<ThemedText variant="link" onPress={handlePress}>Link text</ThemedText>
```

### ThemedView

View component with theme awareness and styling variants.

```tsx
import ThemedView from '../../components/ThemedView';

<ThemedView variant="card" shadow="md">Card content</ThemedView>
<ThemedView variant="surface">Surface content</ThemedView>
```

### Button

Versatile button component with multiple variants and states.

```tsx
import Button from '../../components/ui/Button';

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
import Card from '../../components/ui/Card';

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
import Avatar from '../../components/ui/Avatar';

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
import EmptyState from '../../components/ui/EmptyState';

<EmptyState
  icon="document-text-outline"
  title="No Documents"
  description="You don't have any documents yet."
  actionLabel="Create Document"
  onAction={handleCreateDocument}
/>
```

### ListItem

Consistent list item for navigation and settings screens.

```tsx
import ListItem from '../../components/ListItem';

<ListItem
  icon="settings-outline"
  text="Settings"
  description="App preferences and account settings"
  onPress={navigateToSettings}
/>
```

### IconButton

Simple button component with an icon.

```tsx
import IconButton from '../../components/ui/IconButton';

<IconButton
  iconName="add"
  size={24}
  color={iconColor}
  onPress={handleAdd}
/>
```

### Divider

Line component for separating content.

```tsx
import Divider from '../../components/ui/Divider';

<Divider />
<Divider orientation="vertical" />
<Divider inset={16} />
```

### FloatingActionMenu

A floating action button with expandable menu items.

```tsx
import FloatingActionMenu, { FabMenuItemAction } from '../../components/ui/FloatingActionMenu';

const menuItems: FabMenuItemAction[] = [
  {
    id: 'create',
    text: 'Create',
    iconName: 'add',
    onPress: handleCreate,
  },
  {
    id: 'edit',
    text: 'Edit',
    iconName: 'pencil',
    onPress: handleEdit,
  },
];

<FloatingActionMenu menuItems={menuItems} />
```

### AppHeader

Consistent header component for screens.

```tsx
import AppHeader from '../../components/ui/AppHeader';

<AppHeader 
  title="Screen Title"
  headerRight={() => (
    <IconButton 
      iconName="settings" 
      size={24} 
      color={iconColor} 
      onPress={handleSettings} 
    />
  )}
/>
```

### AnimatedActionSheet

A slide-up action sheet with actions.

```tsx
import AnimatedActionSheet from '../../components/ui/AnimatedActionSheet';

const actions = [
  { title: 'Edit', onPress: handleEdit },
  { title: 'Delete', onPress: handleDelete, style: 'destructive' },
  { title: 'Cancel', onPress: closeActionSheet, style: 'cancel' },
];

<AnimatedActionSheet
  isVisible={isActionSheetVisible}
  onClose={closeActionSheet}
  title="Actions"
  actions={actions}
/>
```

## Screen Layout Components

### ScreenLayout (legacy wrapper)

Maintained for backward compatibility, now uses the Screen component internally.

```tsx
import ScreenLayout from '../../components/ui/ScreenLayout';

<ScreenLayout
  scroll="auto"
  useSafeArea={true}
  withStatusBar={true}
  padding={true}
>
  {/* Your screen content */}
</ScreenLayout>
```

## Feed Components

### FeedCard

A card component for displaying posts in the feed.

```tsx
import FeedCard from '../../components/ui/feed/FeedCard';

<FeedCard
  post={post}
  onPress={handlePostPress}
  onMorePress={handleMoreOptions}
/>
```

## Theme and Style Hooks

For consistent styling and theming across the app, use our theme hooks:

```tsx
import { 
  useTextColor, 
  useBackgroundColor, 
  useBorderColor, 
  useIconColor,
  useButtonBackgroundColor,
  useButtonTextColor
} from '../../hooks/useThemeColor';

// In your component
const textColor = useTextColor('primary');
const backgroundColor = useBackgroundColor('secondary');
const borderColor = useBorderColor();
const iconColor = useIconColor('secondary');
const buttonBgColor = useButtonBackgroundColor('primary');
const buttonTextColor = useButtonTextColor('primary');
```

## Design Tokens

The component library is built on a consistent design system with these core design tokens:

### Colors

Semantic color system with light/dark theme support.

```tsx
import { Colors } from '../../constants/Colors';

// Using semantic colors (preferred)
const primaryTextColor = Colors.light.text.primary;
const buttonBackground = Colors.dark.button.primary.background;

// Direct access to palette
const dynastyGreen = Colors.palette.dynastyGreen.dark;
```

### Typography

Consistent text styles for headings, body text, etc.

```tsx
import Typography from '../../constants/Typography';

// Using precomposed styles (preferred)
const headingStyle = Typography.styles.heading1;
const bodyStyle = Typography.styles.bodyMedium;

// Direct access
const largeFontSize = Typography.size.xl;
const boldWeight = Typography.weight.bold;
```

### Spacing

Standardized spacing values for consistent layout.

```tsx
import { Spacing, BorderRadius, Shadows, Layout } from '../../constants/Spacing';

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

## Best Practices

1. **Use Screen Components**: Always use Screen or ScreenLayout as the root component for screens.

2. **Consistent Typography**: Use ThemedText with appropriate variants instead of raw Text components.

3. **Responsive Layouts**: Use the spacing system for consistent margins and padding.

4. **Theme Awareness**: Use the theme hooks to get colors that respect the user's theme setting.

5. **Component Composition**: Compose complex UI using the basic building blocks provided.

6. **Accessibility**: Use the built-in accessibility props on components when available.

7. **Icons**: Use Ionicons consistently with the IconButton component where applicable.

## Style Guide

For a visual reference of all components and styles, navigate to the StyleGuide screen:

```tsx
import { router } from 'expo-router';
router.push('/(screens)/StyleGuide');
```
