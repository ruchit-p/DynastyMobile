import React, { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import type { Node, ExtNode } from 'relatives-tree/lib/types';

import { FamilyTree } from '../../components/FamilyTree';
import AnimatedActionSheet from '../../components/ui/AnimatedActionSheet';
import IconButton, { IconSet } from '../../components/ui/IconButton';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { Spacing, BorderRadius } from '../../constants/Spacing';
import { useAuth } from '../../src/contexts/AuthContext';
import { getFamilyTreeDataMobile } from '../../src/lib/firebaseUtils';
import { useErrorHandler } from '../../hooks/useErrorHandler';
import { ErrorSeverity } from '../../src/lib/ErrorHandlingService';
import { transformFirebaseToRelativesTree } from '../../utils/familyTreeTransform';
import { logger } from '../../src/services/LoggingService';

const FamilyTreeScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const { user, firestoreUser } = useAuth();
  const { handleError, withErrorHandling } = useErrorHandler({
    severity: ErrorSeverity.ERROR,
    title: 'Family Tree Error',
    trackCurrentScreen: true
  });

  const [nodes, setNodes] = useState<Node[]>([]);
  const [firebaseNodeMap, setFirebaseNodeMap] = useState<Map<string, any>>(new Map());
  const [selectedNode, setSelectedNode] = useState<ExtNode | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isNodeActionMenuVisible, setIsNodeActionMenuVisible] = useState(false);
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const [performanceMode, setPerformanceMode] = useState<'performance' | 'balanced' | 'quality'>('balanced');

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <IconButton
          iconSet={IconSet.Ionicons}
          iconName="ellipsis-vertical"
          size={24}
          color={Colors.dynastyGreen}
          onPress={() => setIsHeaderMenuVisible(true)}
          style={{ marginRight: Platform.OS === 'ios' ? 10 : 15 }}
          accessibilityLabel="Family tree options"
        />
      ),
    });
  }, [navigation]);

  useEffect(() => {
    if (!user) return;

    const loadFamilyTree = async () => {
      setIsLoading(true);
      const startTime = performance.now();

      try {
        const { treeNodes } = await getFamilyTreeDataMobile(user.uid);
        
        const { nodes: transformedNodes, nodeMap } = transformFirebaseToRelativesTree(treeNodes);
        
        setNodes(transformedNodes);
        setFirebaseNodeMap(nodeMap);

        const loadTime = performance.now() - startTime;
        logger.debug(`[FamilyTree] Loaded ${transformedNodes.length} nodes in ${loadTime.toFixed(2)}ms`);

        if (transformedNodes.length > 1000) {
          setPerformanceMode('performance');
        } else if (transformedNodes.length < 100) {
          setPerformanceMode('quality');
        }
      } catch (error) {
        handleError(error, {
          severity: ErrorSeverity.ERROR,
          metadata: {
            action: 'loadFamilyTree',
            userId: user.uid,
          },
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadFamilyTree();
  }, [user, handleError]);

  const handleNodePress = useCallback((node: ExtNode) => {
    setSelectedNode(node);
    setIsNodeActionMenuVisible(true);
  }, []);

  const handleAddMember = withErrorHandling(async (relationType: 'parent' | 'spouse' | 'child') => {
    if (!selectedNode) {
      throw new Error('No node selected');
    }

    const firebaseNode = firebaseNodeMap.get(selectedNode.id);
    
    router.push({
      pathname: '/(screens)/addFamilyMember',
      params: {
        selectedNodeId: selectedNode.id,
        relationType,
        selectedNodeName: firebaseNode?.attributes?.displayName || 'Unknown',
      },
    });
  }, 'Failed to add family member');

  const handleViewProfile = withErrorHandling(async () => {
    if (!selectedNode) {
      throw new Error('No node selected');
    }

    const firebaseNode = firebaseNodeMap.get(selectedNode.id);
    
    router.push({
      pathname: '/(screens)/ViewProfileScreen',
      params: {
        memberId: selectedNode.id,
        memberName: firebaseNode?.attributes?.displayName || 'Unknown',
      },
    });
  }, 'Failed to view profile');

  const renderNode = useCallback((node: ExtNode, isSelected: boolean) => {
    const firebaseNode = firebaseNodeMap.get(node.id);
    const attributes = firebaseNode?.attributes || {};
    const name = attributes.displayName || '';
    const avatar = attributes.profilePicture || 
                   (node.id === user?.uid ? (user.photoURL || firestoreUser?.profilePictureUrl) : undefined);

    return (
      <View style={[styles.nodeContainer, isSelected && styles.selectedNode]}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {name.split(' ').map(n => n[0]).join('').toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.nodeName} numberOfLines={2}>
          {name}
        </Text>
        {node.hasSubTree && (
          <View style={styles.subTreeIndicator} />
        )}
      </View>
    );
  }, [firebaseNodeMap, user, firestoreUser]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dynastyGreen} />
          <Text style={styles.loadingText}>Loading family tree...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isLoading && nodes.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No family members yet</Text>
          <Text style={styles.emptySubtext}>Start building your family tree</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ErrorBoundary screenName="FamilyTreeScreen">
      <SafeAreaView style={styles.container}>
        <FamilyTree
          nodes={nodes}
          rootId={user?.uid || ''}
          renderNode={renderNode}
          onNodePress={handleNodePress}
          selectedNodeId={selectedNode?.id}
          performanceMode={performanceMode}
          onTreeReady={() => {
            logger.debug(`[FamilyTree] Tree rendered with ${nodes.length} nodes`);
          }}
        />

        <AnimatedActionSheet
          isVisible={isNodeActionMenuVisible}
          onClose={() => setIsNodeActionMenuVisible(false)}
          title={`Actions for ${firebaseNodeMap.get(selectedNode?.id || '')?.attributes?.displayName || 'Member'}`}
          actions={[
            { title: 'View Profile', onPress: handleViewProfile },
            { title: 'Add Parent', onPress: () => handleAddMember('parent') },
            { title: 'Add Spouse', onPress: () => handleAddMember('spouse') },
            { title: 'Add Child', onPress: () => handleAddMember('child') },
            { title: 'Cancel', style: 'cancel', onPress: () => {} },
          ]}
        />

        <AnimatedActionSheet
          isVisible={isHeaderMenuVisible}
          onClose={() => setIsHeaderMenuVisible(false)}
          title="Family Tree Options"
          actions={[
            { title: 'Family Tree Settings', onPress: () => {} },
            { title: 'Invite Members', onPress: () => {} },
            { title: 'Export Tree', onPress: () => {} },
            { title: 'Cancel', style: 'cancel', onPress: () => {} },
          ]}
        />
      </SafeAreaView>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.md,
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.secondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyText: {
    ...Typography.styles.heading3,
    color: Colors.light.text.primary,
    marginBottom: Spacing.sm,
  },
  emptySubtext: {
    ...Typography.styles.bodyMedium,
    color: Colors.light.text.secondary,
  },
  nodeContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.palette.dynastyGreen.extraLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dynastyGreen,
    padding: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedNode: {
    borderColor: Colors.palette.status.warning,
    borderWidth: 2,
    backgroundColor: '#FFFDE7',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.xxs,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.light.border.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xxs,
  },
  avatarText: {
    ...Typography.styles.caption,
    fontWeight: Typography.weight.bold,
    color: Colors.light.text.inverse,
  },
  nodeName: {
    ...Typography.styles.caption,
    fontWeight: Typography.weight.semiBold,
    color: Colors.dynastyGreen,
    textAlign: 'center',
  },
  subTreeIndicator: {
    position: 'absolute',
    top: Spacing.xxs,
    right: Spacing.xxs,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.palette.status.info,
  },
});

export default FamilyTreeScreen;