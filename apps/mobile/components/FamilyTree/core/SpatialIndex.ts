import type { ExtNode } from 'relatives-tree/lib/types';

interface GridCell {
  x: number;
  y: number;
  nodes: ExtNode[];
}

export class SpatialIndex {
  private grid: Map<string, GridCell> = new Map();
  private cellSize: number;
  private scaleFactor: number;

  constructor(nodes: ExtNode[], scaleFactor: number, cellSize = 200) {
    this.scaleFactor = scaleFactor;
    this.cellSize = cellSize;
    this.buildIndex(nodes);
  }

  private getGridKey(x: number, y: number): string {
    const gridX = Math.floor(x / this.cellSize);
    const gridY = Math.floor(y / this.cellSize);
    return `${gridX},${gridY}`;
  }

  private buildIndex(nodes: ExtNode[]): void {
    this.grid.clear();

    nodes.forEach(node => {
      const x = node.left * this.scaleFactor;
      const y = node.top * this.scaleFactor;
      const key = this.getGridKey(x, y);

      if (!this.grid.has(key)) {
        this.grid.set(key, {
          x: Math.floor(x / this.cellSize),
          y: Math.floor(y / this.cellSize),
          nodes: [],
        });
      }

      this.grid.get(key)!.nodes.push(node);
    });
  }

  getNodesInBounds(minX: number, minY: number, maxX: number, maxY: number): ExtNode[] {
    const nodes: ExtNode[] = [];
    const processedNodes = new Set<string>();

    const minGridX = Math.floor(minX / this.cellSize);
    const minGridY = Math.floor(minY / this.cellSize);
    const maxGridX = Math.ceil(maxX / this.cellSize);
    const maxGridY = Math.ceil(maxY / this.cellSize);

    for (let x = minGridX; x <= maxGridX; x++) {
      for (let y = minGridY; y <= maxGridY; y++) {
        const key = `${x},${y}`;
        const cell = this.grid.get(key);
        
        if (cell) {
          cell.nodes.forEach(node => {
            if (!processedNodes.has(node.id)) {
              processedNodes.add(node.id);
              nodes.push(node);
            }
          });
        }
      }
    }

    return nodes;
  }

  getNearestNode(x: number, y: number): ExtNode | null {
    const centerGridX = Math.floor(x / this.cellSize);
    const centerGridY = Math.floor(y / this.cellSize);

    let nearestNode: ExtNode | null = null;
    let nearestDistance = Infinity;

    for (let ring = 0; ring < 3; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dy = -ring; dy <= ring; dy++) {
          if (ring > 0 && Math.abs(dx) < ring && Math.abs(dy) < ring) continue;

          const key = `${centerGridX + dx},${centerGridY + dy}`;
          const cell = this.grid.get(key);

          if (cell) {
            cell.nodes.forEach(node => {
              const nodeX = node.left * this.scaleFactor;
              const nodeY = node.top * this.scaleFactor;
              const distance = Math.sqrt(
                Math.pow(nodeX - x, 2) + Math.pow(nodeY - y, 2)
              );

              if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestNode = node;
              }
            });
          }
        }
      }

      if (nearestNode) break;
    }

    return nearestNode;
  }
}