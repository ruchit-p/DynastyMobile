import type { Node } from 'relatives-tree/lib/types';
import calcTree from 'relatives-tree';

class TreeCalculationCache {
  private static instance: TreeCalculationCache;
  private cache = new Map<string, any>();
  private maxCacheSize = 10;

  static getInstance(): TreeCalculationCache {
    if (!TreeCalculationCache.instance) {
      TreeCalculationCache.instance = new TreeCalculationCache();
    }
    return TreeCalculationCache.instance;
  }

  getCacheKey(nodes: Node[], rootId: string): string {
    const nodeIds = nodes.map(n => n.id).sort().join(',');
    return `${rootId}:${nodeIds}:${nodes.length}`;
  }

  get(nodes: Node[], rootId: string): any | null {
    const key = this.getCacheKey(nodes, rootId);
    return this.cache.get(key) || null;
  }

  set(nodes: Node[], rootId: string, result: any): void {
    const key = this.getCacheKey(nodes, rootId);
    
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, result);
  }

  clear(): void {
    this.cache.clear();
  }
}

export function calculateTreeLayout(nodes: Node[], rootId: string, options?: any): any {
  const cache = TreeCalculationCache.getInstance();
  
  const cached = cache.get(nodes, rootId);
  if (cached) {
    return cached;
  }
  
  const result = calcTree(nodes, {
    rootId,
    placeholders: true,
    ...options,
  });
  
  cache.set(nodes, rootId, result);
  return result;
}

export { TreeCalculationCache };