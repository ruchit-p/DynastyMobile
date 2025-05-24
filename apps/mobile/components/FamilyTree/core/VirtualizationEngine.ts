import type { ExtNode } from 'relatives-tree/lib/types';
import type { ViewportBounds, PerformanceMode } from '../types';

export class VirtualizationEngine {
  private nodes: ExtNode[];
  private scaleFactor: number;
  private performanceMode: PerformanceMode;
  private nodeWidth = 150;
  private nodeHeight = 80;
  private bufferMultiplier: number;

  constructor(nodes: ExtNode[], scaleFactor: number, performanceMode: PerformanceMode = 'balanced') {
    this.nodes = nodes;
    this.scaleFactor = scaleFactor;
    this.performanceMode = performanceMode;
    
    this.bufferMultiplier = {
      'performance': 0.5,
      'balanced': 1.0,
      'quality': 2.0,
    }[performanceMode];
  }

  getVisibleNodes(viewport: ViewportBounds): ExtNode[] {
    const buffer = 200 * this.bufferMultiplier;
    
    const expandedBounds = {
      minX: viewport.minX - buffer,
      maxX: viewport.maxX + buffer,
      minY: viewport.minY - buffer,
      maxY: viewport.maxY + buffer,
    };

    return this.nodes.filter(node => {
      const nodeLeft = node.left * this.scaleFactor;
      const nodeTop = node.top * this.scaleFactor;
      const nodeRight = nodeLeft + this.nodeWidth;
      const nodeBottom = nodeTop + this.nodeHeight;

      return (
        nodeRight >= expandedBounds.minX &&
        nodeLeft <= expandedBounds.maxX &&
        nodeBottom >= expandedBounds.minY &&
        nodeTop <= expandedBounds.maxY
      );
    });
  }

  getNodesInRadius(centerNode: ExtNode, radius: number): ExtNode[] {
    const centerX = centerNode.left * this.scaleFactor;
    const centerY = centerNode.top * this.scaleFactor;

    return this.nodes.filter(node => {
      const nodeX = node.left * this.scaleFactor;
      const nodeY = node.top * this.scaleFactor;
      const distance = Math.sqrt(
        Math.pow(nodeX - centerX, 2) + Math.pow(nodeY - centerY, 2)
      );
      return distance <= radius;
    });
  }

  prioritizeNodes(nodes: ExtNode[], centerX: number, centerY: number): ExtNode[] {
    return nodes.sort((a, b) => {
      const distA = Math.sqrt(
        Math.pow(a.left * this.scaleFactor - centerX, 2) +
        Math.pow(a.top * this.scaleFactor - centerY, 2)
      );
      const distB = Math.sqrt(
        Math.pow(b.left * this.scaleFactor - centerX, 2) +
        Math.pow(b.top * this.scaleFactor - centerY, 2)
      );
      return distA - distB;
    });
  }
}