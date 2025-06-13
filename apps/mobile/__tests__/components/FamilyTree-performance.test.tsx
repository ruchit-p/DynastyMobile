import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Dimensions } from 'react-native';
import FamilyTree from '../../components/FamilyTree';
import { VirtualizationEngine } from '../../components/FamilyTree/core/VirtualizationEngine';
import { SpatialIndex } from '../../components/FamilyTree/core/SpatialIndex';
import { GestureHandler } from '../../components/FamilyTree/core/GestureHandler';
import { calculateNodePositions, calculateConnectors } from '../../components/FamilyTree/utils/calculations';
import { MemoryManager } from '../../components/FamilyTree/utils/memoryManager';
import { FamilyMember, TreeNode } from '../../components/FamilyTree/types';

// Mock dimensions
jest.mock('react-native/Libraries/Utilities/Dimensions', () => ({
  get: jest.fn(() => ({ width: 375, height: 812 })),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
}));

// Performance test utilities
const measurePerformance = async (fn: () => Promise<void> | void) => {
  const start = performance.now();
  await fn();
  const end = performance.now();
  return end - start;
};

const generateLargeFamilyTree = (nodeCount: number): FamilyMember[] => {
  const members: FamilyMember[] = [];
  const generationsCount = Math.ceil(Math.log2(nodeCount));
  let currentId = 1;

  // Create root
  members.push({
    id: `member-${currentId}`,
    firstName: 'Root',
    lastName: 'Ancestor',
    birthDate: '1900-01-01',
    gender: 'male',
    generation: 0,
    parentIds: [],
    spouseIds: [`member-${currentId + 1}`],
    childrenIds: [],
  });
  currentId++;

  // Create root spouse
  members.push({
    id: `member-${currentId}`,
    firstName: 'Root',
    lastName: 'Spouse',
    birthDate: '1902-01-01',
    gender: 'female',
    generation: 0,
    parentIds: [],
    spouseIds: [`member-1`],
    childrenIds: [],
  });
  currentId++;

  // Generate tree structure
  for (let gen = 1; gen < generationsCount && currentId <= nodeCount; gen++) {
    const parentsInPrevGen = members.filter(m => m.generation === gen - 1);
    
    for (const parent of parentsInPrevGen) {
      if (currentId > nodeCount) break;
      
      const childrenCount = Math.min(3, nodeCount - currentId + 1);
      const childrenIds: string[] = [];
      
      for (let i = 0; i < childrenCount && currentId <= nodeCount; i++) {
        const childId = `member-${currentId}`;
        childrenIds.push(childId);
        
        members.push({
          id: childId,
          firstName: `Person${currentId}`,
          lastName: `Gen${gen}`,
          birthDate: `${1930 + gen * 25}-01-01`,
          gender: i % 2 === 0 ? 'male' : 'female',
          generation: gen,
          parentIds: parent.spouseIds.length > 0 ? [parent.id, parent.spouseIds[0]] : [parent.id],
          spouseIds: [],
          childrenIds: [],
        });
        currentId++;
      }
      
      // Update parent's children
      parent.childrenIds = childrenIds;
      if (parent.spouseIds.length > 0) {
        const spouse = members.find(m => m.id === parent.spouseIds[0]);
        if (spouse) spouse.childrenIds = childrenIds;
      }
    }
  }

  return members;
};

describe('FamilyTree Performance Tests', () => {
  let mockOnMemberPress: jest.Mock;
  let mockOnMemberLongPress: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnMemberPress = jest.fn();
    mockOnMemberLongPress = jest.fn();
    
    // Reset performance marks
    performance.clearMarks();
    performance.clearMeasures();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Large Dataset Rendering', () => {
    it('should render 1000 nodes within acceptable time', async () => {
      const largeFamily = generateLargeFamilyTree(1000);
      
      const renderTime = await measurePerformance(async () => {
        const { getByTestId } = render(
          <FamilyTree
            members={largeFamily}
            onMemberPress={mockOnMemberPress}
            onMemberLongPress={mockOnMemberLongPress}
            testID="family-tree"
          />
        );
        
        await waitFor(() => {
          expect(getByTestId('family-tree')).toBeTruthy();
        });
      });

      expect(renderTime).toBeLessThan(1000); // Should render in less than 1 second
    });

    it('should handle 10,000 nodes with virtualization', async () => {
      const hugeFamily = generateLargeFamilyTree(10000);
      const virtualizationEngine = new VirtualizationEngine();
      
      const initTime = await measurePerformance(() => {
        virtualizationEngine.initialize(hugeFamily);
      });
      
      expect(initTime).toBeLessThan(200); // Initialization should be fast
      
      // Test viewport query performance
      const viewport = { x: 0, y: 0, width: 375, height: 812 };
      const queryTime = await measurePerformance(() => {
        const visibleNodes = virtualizationEngine.getVisibleNodes(viewport);
        expect(visibleNodes.length).toBeLessThan(100); // Should only return visible nodes
      });
      
      expect(queryTime).toBeLessThan(16); // Should complete within one frame (60fps)
    });

    it('should efficiently calculate node positions for large trees', async () => {
      const nodeCount = 5000;
      const family = generateLargeFamilyTree(nodeCount);
      
      const calculationTime = await measurePerformance(() => {
        const positions = calculateNodePositions(family);
        expect(Object.keys(positions).length).toBe(nodeCount);
      });
      
      expect(calculationTime).toBeLessThan(500); // Should calculate in under 500ms
    });
  });

  describe('Interaction Performance', () => {
    it('should handle smooth panning with 1000 nodes', async () => {
      const family = generateLargeFamilyTree(1000);
      const gestureHandler = new GestureHandler();
      
      const { getByTestId } = render(
        <FamilyTree
          members={family}
          onMemberPress={mockOnMemberPress}
          testID="family-tree"
        />
      );
      
      const tree = getByTestId('family-tree');
      
      // Simulate pan gesture
      const panTimes: number[] = [];
      
      for (let i = 0; i < 60; i++) { // 60 frames (1 second at 60fps)
        const panTime = await measurePerformance(() => {
          fireEvent(tree, 'onPanGestureEvent', {
            nativeEvent: {
              translationX: i * 5,
              translationY: i * 3,
              state: 2, // ACTIVE
            },
          });
        });
        panTimes.push(panTime);
      }
      
      const avgPanTime = panTimes.reduce((a, b) => a + b) / panTimes.length;
      expect(avgPanTime).toBeLessThan(16); // Each frame should process in <16ms
    });

    it('should handle smooth zooming with spatial indexing', async () => {
      const family = generateLargeFamilyTree(2000);
      const spatialIndex = new SpatialIndex();
      
      // Build spatial index
      const buildTime = await measurePerformance(() => {
        const positions = calculateNodePositions(family);
        Object.entries(positions).forEach(([id, pos]) => {
          spatialIndex.insert({
            id,
            x: pos.x,
            y: pos.y,
            width: 120,
            height: 80,
          });
        });
      });
      
      expect(buildTime).toBeLessThan(100); // Spatial index should build quickly
      
      // Test zoom performance
      const zoomLevels = [0.5, 0.75, 1, 1.5, 2, 3];
      const zoomTimes: number[] = [];
      
      for (const zoom of zoomLevels) {
        const viewport = {
          x: -375 * (zoom - 1) / 2,
          y: -812 * (zoom - 1) / 2,
          width: 375 / zoom,
          height: 812 / zoom,
        };
        
        const queryTime = await measurePerformance(() => {
          const visible = spatialIndex.query(viewport);
          expect(visible.length).toBeGreaterThan(0);
        });
        
        zoomTimes.push(queryTime);
      }
      
      const avgZoomTime = zoomTimes.reduce((a, b) => a + b) / zoomTimes.length;
      expect(avgZoomTime).toBeLessThan(5); // Spatial queries should be very fast
    });

    it('should handle rapid node selection without lag', async () => {
      const family = generateLargeFamilyTree(500);
      
      const { getByTestId } = render(
        <FamilyTree
          members={family}
          onMemberPress={mockOnMemberPress}
          testID="family-tree"
        />
      );
      
      // Simulate rapid selections
      const selectionTimes: number[] = [];
      
      for (let i = 0; i < 20; i++) {
        const memberId = `member-${Math.floor(Math.random() * 500) + 1}`;
        
        const selectionTime = await measurePerformance(() => {
          fireEvent.press(getByTestId(`node-${memberId}`));
        });
        
        selectionTimes.push(selectionTime);
      }
      
      const avgSelectionTime = selectionTimes.reduce((a, b) => a + b) / selectionTimes.length;
      expect(avgSelectionTime).toBeLessThan(50); // Selection should be responsive
      expect(mockOnMemberPress).toHaveBeenCalledTimes(20);
    });
  });

  describe('Memory Management', () => {
    it('should efficiently manage memory with node recycling', async () => {
      const memoryManager = new MemoryManager();
      const nodeCount = 5000;
      
      // Track memory usage
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create and dispose nodes multiple times
      for (let i = 0; i < 10; i++) {
        const nodes = Array.from({ length: 100 }, (_, j) => ({
          id: `node-${i}-${j}`,
          data: new Array(1000).fill(0), // Simulate node data
        }));
        
        nodes.forEach(node => memoryManager.registerNode(node));
        
        // Simulate viewport change
        memoryManager.cleanupInvisibleNodes(['node-0-0', 'node-0-1']);
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;
      
      // Memory growth should be controlled
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // Less than 50MB growth
    });

    it('should handle connector calculation efficiently', async () => {
      const family = generateLargeFamilyTree(1000);
      const positions = calculateNodePositions(family);
      
      const connectorTime = await measurePerformance(() => {
        const connectors = calculateConnectors(family, positions);
        expect(connectors.length).toBeGreaterThan(0);
      });
      
      expect(connectorTime).toBeLessThan(100); // Connector calculation should be fast
    });
  });

  describe('Progressive Rendering', () => {
    it('should render large trees progressively', async () => {
      const family = generateLargeFamilyTree(3000);
      let renderedNodes = 0;
      
      const onProgressiveRender = jest.fn((count: number) => {
        renderedNodes = count;
      });
      
      const { rerender } = render(
        <FamilyTree
          members={family}
          onMemberPress={mockOnMemberPress}
          enableProgressiveRendering
          onProgressiveRender={onProgressiveRender}
          testID="family-tree"
        />
      );
      
      // Wait for initial render
      await waitFor(() => {
        expect(onProgressiveRender).toHaveBeenCalled();
      });
      
      // Should render in batches
      expect(renderedNodes).toBeLessThan(family.length);
      expect(renderedNodes).toBeGreaterThan(50); // At least first batch
      
      // Wait for complete render
      await waitFor(() => {
        expect(renderedNodes).toBe(family.length);
      }, { timeout: 5000 });
    });

    it('should prioritize viewport nodes during progressive rendering', async () => {
      const family = generateLargeFamilyTree(2000);
      const renderedNodeIds: string[] = [];
      
      const onNodeRender = jest.fn((nodeId: string) => {
        renderedNodeIds.push(nodeId);
      });
      
      render(
        <FamilyTree
          members={family}
          onMemberPress={mockOnMemberPress}
          enableProgressiveRendering
          onNodeRender={onNodeRender}
          initialViewport={{ x: 0, y: 0, zoom: 1 }}
          testID="family-tree"
        />
      );
      
      await waitFor(() => {
        expect(renderedNodeIds.length).toBeGreaterThan(0);
      });
      
      // First rendered nodes should be near viewport center
      const firstBatch = renderedNodeIds.slice(0, 50);
      const centralNodes = family.filter(m => m.generation <= 2).map(m => m.id);
      
      const centralNodesRendered = firstBatch.filter(id => centralNodes.includes(id));
      expect(centralNodesRendered.length).toBeGreaterThan(firstBatch.length * 0.5);
    });
  });

  describe('Search Performance', () => {
    it('should search through 10,000 nodes efficiently', async () => {
      const family = generateLargeFamilyTree(10000);
      
      const searchTests = [
        { query: 'Person5000', expectedCount: 1 },
        { query: 'Gen3', expectedCount: 100 }, // Approximate
        { query: 'John', expectedCount: 0 },
      ];
      
      for (const test of searchTests) {
        const searchTime = await measurePerformance(() => {
          const results = family.filter(member => 
            member.firstName.toLowerCase().includes(test.query.toLowerCase()) ||
            member.lastName.toLowerCase().includes(test.query.toLowerCase())
          );
          
          if (test.expectedCount > 0) {
            expect(results.length).toBeGreaterThan(0);
          } else {
            expect(results.length).toBe(0);
          }
        });
        
        expect(searchTime).toBeLessThan(50); // Search should complete quickly
      }
    });

    it('should highlight search results without performance impact', async () => {
      const family = generateLargeFamilyTree(1000);
      const searchQuery = 'Gen2';
      
      const { rerender } = render(
        <FamilyTree
          members={family}
          onMemberPress={mockOnMemberPress}
          testID="family-tree"
        />
      );
      
      const highlightTime = await measurePerformance(() => {
        rerender(
          <FamilyTree
            members={family}
            onMemberPress={mockOnMemberPress}
            searchQuery={searchQuery}
            testID="family-tree"
          />
        );
      });
      
      expect(highlightTime).toBeLessThan(100); // Re-render with highlights should be fast
    });
  });

  describe('Stress Tests', () => {
    it('should handle maximum supported nodes (25,000)', async () => {
      const maxFamily = generateLargeFamilyTree(25000);
      const virtualizationEngine = new VirtualizationEngine();
      
      const initTime = await measurePerformance(() => {
        virtualizationEngine.initialize(maxFamily);
      });
      
      expect(initTime).toBeLessThan(1000); // Should initialize within 1 second
      
      // Test various operations
      const operations = [
        () => virtualizationEngine.getVisibleNodes({ x: 0, y: 0, width: 375, height: 812 }),
        () => virtualizationEngine.getNodeAtPosition(1000, 1000),
        () => virtualizationEngine.updateViewport({ x: 5000, y: 5000, width: 375, height: 812 }),
      ];
      
      for (const op of operations) {
        const opTime = await measurePerformance(op);
        expect(opTime).toBeLessThan(16); // Each operation should be within frame budget
      }
    });

    it('should maintain 60fps during continuous interaction', async () => {
      const family = generateLargeFamilyTree(5000);
      
      const { getByTestId } = render(
        <FamilyTree
          members={family}
          onMemberPress={mockOnMemberPress}
          testID="family-tree"
        />
      );
      
      const tree = getByTestId('family-tree');
      const frameTimes: number[] = [];
      
      // Simulate 5 seconds of continuous interaction
      for (let frame = 0; frame < 300; frame++) {
        const frameStart = performance.now();
        
        // Alternate between different interactions
        if (frame % 3 === 0) {
          fireEvent(tree, 'onPanGestureEvent', {
            nativeEvent: {
              translationX: Math.sin(frame / 10) * 100,
              translationY: Math.cos(frame / 10) * 100,
              state: 2,
            },
          });
        } else if (frame % 3 === 1) {
          fireEvent(tree, 'onPinchGestureEvent', {
            nativeEvent: {
              scale: 1 + Math.sin(frame / 20) * 0.5,
              state: 2,
            },
          });
        }
        
        const frameEnd = performance.now();
        frameTimes.push(frameEnd - frameStart);
      }
      
      // Calculate frame statistics
      const avgFrameTime = frameTimes.reduce((a, b) => a + b) / frameTimes.length;
      const maxFrameTime = Math.max(...frameTimes);
      const droppedFrames = frameTimes.filter(t => t > 16.67).length;
      
      expect(avgFrameTime).toBeLessThan(16.67); // Average 60fps
      expect(maxFrameTime).toBeLessThan(33.33); // No frame worse than 30fps
      expect(droppedFrames / frameTimes.length).toBeLessThan(0.05); // Less than 5% dropped frames
    });
  });
});

describe('FamilyTree Memory Leak Tests', () => {
  it('should not leak memory on repeated mount/unmount', async () => {
    const family = generateLargeFamilyTree(1000);
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Mount and unmount 10 times
    for (let i = 0; i < 10; i++) {
      const { unmount } = render(
        <FamilyTree
          members={family}
          onMemberPress={jest.fn()}
        />
      );
      
      await waitFor(() => {
        expect(true).toBe(true); // Let component fully render
      });
      
      unmount();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    // Memory increase should be minimal
    expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // Less than 10MB
  });

  it('should clean up event listeners properly', async () => {
    const family = generateLargeFamilyTree(500);
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
    
    const { unmount } = render(
      <FamilyTree
        members={family}
        onMemberPress={jest.fn()}
      />
    );
    
    const addedListeners = addEventListenerSpy.mock.calls.length;
    
    unmount();
    
    const removedListeners = removeEventListenerSpy.mock.calls.length;
    
    expect(removedListeners).toBe(addedListeners);
    
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });
});