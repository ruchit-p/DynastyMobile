import type { Node } from 'relatives-tree/lib/types';

interface FirebaseNode {
  id: string;
  gender: 'male' | 'female' | 'other';
  parents: { id: string; type: 'blood' | 'adopted' }[];
  children: { id: string; type: 'blood' | 'adopted' }[];
  siblings: { id: string; type: 'blood' | 'half' }[];
  spouses: { id: string; type: 'married' | 'divorced' }[];
  attributes?: {
    displayName: string;
    profilePicture?: string;
    birthDate?: string;
    deathDate?: string;
    [key: string]: any;
  };
}

export function transformFirebaseToRelativesTree(
  firebaseNodes: FirebaseNode[]
): { nodes: Node[]; nodeMap: Map<string, FirebaseNode> } {
  const nodeMap = new Map<string, FirebaseNode>();
  
  // Build map for quick lookup
  firebaseNodes.forEach(node => {
    nodeMap.set(node.id, node);
  });

  // Transform to relatives-tree format
  const nodes: Node[] = firebaseNodes.map(fbNode => ({
    id: fbNode.id,
    gender: fbNode.gender === 'other' ? 'male' : fbNode.gender,
    parents: fbNode.parents
      .filter(p => p.type === 'blood')
      .map(p => ({ id: p.id, type: 'blood' as const })),
    children: fbNode.children
      .filter(c => c.type === 'blood')
      .map(c => ({ id: c.id, type: 'blood' as const })),
    siblings: fbNode.siblings
      .filter(s => s.type === 'blood')
      .map(s => ({ id: s.id, type: 'blood' as const })),
    spouses: fbNode.spouses
      .filter(s => s.type === 'married')
      .map(s => ({ id: s.id, type: 'married' as const })),
  }));

  return { nodes, nodeMap };
}