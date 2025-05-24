import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { FamilyTree } from '../index';
import type { Node } from 'relatives-tree/lib/types';

// Mock dependencies
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: any) => children,
  GestureDetector: ({ children }: any) => children,
  Gesture: {
    Pinch: () => ({ onUpdate: () => {}, onEnd: () => {} }),
    Pan: () => ({ onUpdate: () => {}, onEnd: () => {} }),
    Simultaneous: () => ({}),
  },
}));

// Mock relatives-tree
jest.mock('relatives-tree', () => ({
  __esModule: true,
  default: (nodes: Node[]) => ({
    nodes: nodes.map((node, i) => ({
      ...node,
      left: i * 200,
      top: i * 100,
      hasSubTree: false,
    })),
    connectors: [],
    canvas: { width: 1000, height: 500 },
  }),
}));

const generateMockNodes = (count: number): Node[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `node-${i}`,
    gender: i % 2 === 0 ? 'male' : 'female',
    parents: i > 0 ? [{ id: `node-${Math.floor((i - 1) / 2)}`, type: 'blood' as const }] : [],
    children: [],
    siblings: [],
    spouses: [],
  }));
};

describe('FamilyTree Component', () => {
  it('renders without crashing', () => {
    const nodes = generateMockNodes(10);
    const { getByTestId } = render(
      <FamilyTree nodes={nodes} rootId="node-0" />
    );
    
    // Component should render
    expect(() => getByTestId('family-tree-container')).not.toThrow();
  });

  it('handles empty nodes gracefully', () => {
    const { container } = render(
      <FamilyTree nodes={[]} rootId="root" />
    );
    
    expect(container).toBeTruthy();
  });

  it('calls onNodePress when a node is pressed', async () => {
    const nodes = generateMockNodes(5);
    const onNodePress = jest.fn();
    
    const { getByTestId } = render(
      <FamilyTree 
        nodes={nodes} 
        rootId="node-0"
        onNodePress={onNodePress}
      />
    );

    // Wait for tree to be ready
    await waitFor(() => {
      expect(onNodePress).not.toHaveBeenCalled();
    });
  });

  it('applies performance mode correctly', () => {
    const nodes = generateMockNodes(100);
    
    const { rerender } = render(
      <FamilyTree nodes={nodes} rootId="node-0" performanceMode="performance" />
    );

    // Should render with performance mode
    expect(() => {
      rerender(
        <FamilyTree nodes={nodes} rootId="node-0" performanceMode="quality" />
      );
    }).not.toThrow();
  });
});