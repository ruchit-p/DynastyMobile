import { useMemo } from 'react';
import type { Node } from 'relatives-tree/lib/types';
import { calculateTreeLayout } from '../utils/calculations';
import { measurePerformance } from '../utils/performance';

export function useTreeCalculation(nodes: Node[], rootId: string) {
  return useMemo(() => {
    if (!nodes || nodes.length === 0 || !rootId) {
      return null;
    }

    return measurePerformance('calculateTree', () => {
      return calculateTreeLayout(nodes, rootId);
    }, { nodeCount: nodes.length });
  }, [nodes, rootId]);
}