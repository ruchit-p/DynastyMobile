import type { ExtNode, Node } from 'relatives-tree/lib/types';

export type PerformanceMode = 'performance' | 'balanced' | 'quality';

export interface ViewportBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface FamilyTreeProps {
  nodes: Node[];
  rootId: string;
  renderNode?: (node: ExtNode, isSelected: boolean) => React.ReactNode;
  onNodePress?: (node: ExtNode) => void;
  selectedNodeId?: string;
  style?: any;
  onTreeReady?: () => void;
  performanceMode?: PerformanceMode;
}

export interface NodeRendererProps {
  node: ExtNode;
  isSelected: boolean;
  scale: number;
  scaleFactor: number;
  onPress: () => void;
  renderContent?: (node: ExtNode, isSelected: boolean) => React.ReactNode;
}

export interface ConnectorRendererProps {
  connectors: any[];
  viewport: ViewportBounds | null;
  scale: number;
  scaleFactor: number;
}

export interface MemoryStatus {
  used: number;
  total: number;
  percentage: number;
  needsCleanup: boolean;
}

export interface PerformanceReport {
  timestamp: number;
  metrics: Record<string, {
    count: number;
    average: number;
    min: number;
    max: number;
    p95: number;
  }>;
}