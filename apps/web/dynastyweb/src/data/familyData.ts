import { Node, Gender, RelType } from 'relatives-tree/lib/types';

// MARK: - Constants for relationship types
const BLOOD = 'blood' as RelType;
const MARRIED = 'married' as RelType;
const MALE = 'male' as Gender;
const FEMALE = 'female' as Gender;

// MARK: - Names mapping
export const familyNames: { [key: string]: string } = {
  'TsyAkbF89': 'George Sr.',
  'T54Km7uOC': 'Margaret',
  'gsgwGS_Kw': 'Harold',
  'ZgTZx9uXQ': 'Dorothy',
  'ypu71w9_Q': 'George Jr.',
  'GEf8zF7A4': 'Eleanor',
  '2DlrR0fK8': 'Robert',
  'H-06WvsfJ': 'Catherine',
  '6vASIIxhd': 'James',
  'iFiwqrWx-': 'Linda',
  'HkqEDLvxE': 'Thomas',
  '011jVS4rb': 'William',
  'PXACjDxmR': 'Elizabeth',
  'kuVISwh7w': 'Michael',
  'UIEjvLJMd': 'Sarah',
  'RZbkr5vAi': 'James R.',
  'vRSjcaDGj': 'Emma',
  'Fbc9iwnJl': 'Sophia',
  '6_OTJvbvS': 'Daniel',
  'JhSCcdFEP': 'Emily',
  '6hNxNY1-I': 'Lucas',
  'ZVi8fWDBx': 'David',
  'wJ1EBvc5m': 'Rachel'
};

// MARK: - Family Data
export const familyData: Node[] = [
  // First Generation (Great Grandparents)
  {
    id: 'TsyAkbF89',
    gender: MALE,
    parents: [],
    children: [{ id: 'ypu71w9_Q', type: BLOOD }],
    siblings: [],
    spouses: [{ id: 'T54Km7uOC', type: MARRIED }]
  },
  {
    id: 'T54Km7uOC',
    gender: FEMALE,
    parents: [],
    children: [{ id: 'ypu71w9_Q', type: BLOOD }],
    siblings: [],
    spouses: [{ id: 'TsyAkbF89', type: MARRIED }]
  },
  {
    id: 'gsgwGS_Kw',
    gender: MALE,
    parents: [],
    children: [{ id: 'GEf8zF7A4', type: BLOOD }],
    siblings: [],
    spouses: [{ id: 'ZgTZx9uXQ', type: MARRIED }]
  },
  {
    id: 'ZgTZx9uXQ',
    gender: FEMALE,
    parents: [],
    children: [{ id: 'GEf8zF7A4', type: BLOOD }],
    siblings: [],
    spouses: [{ id: 'gsgwGS_Kw', type: MARRIED }]
  },
  // Second Generation (Grandparents)
  {
    id: 'ypu71w9_Q',
    gender: MALE,
    parents: [
      { id: 'TsyAkbF89', type: BLOOD },
      { id: 'T54Km7uOC', type: BLOOD }
    ],
    children: [{ id: '011jVS4rb', type: BLOOD }],
    siblings: [],
    spouses: [{ id: 'GEf8zF7A4', type: MARRIED }]
  },
  {
    id: 'GEf8zF7A4',
    gender: FEMALE,
    parents: [
      { id: 'gsgwGS_Kw', type: BLOOD },
      { id: 'ZgTZx9uXQ', type: BLOOD }
    ],
    children: [{ id: '011jVS4rb', type: BLOOD }],
    siblings: [],
    spouses: [{ id: 'ypu71w9_Q', type: MARRIED }]
  },
  {
    id: '2DlrR0fK8',
    gender: MALE,
    parents: [],
    children: [
      { id: 'PXACjDxmR', type: BLOOD },
      { id: 'H-06WvsfJ', type: BLOOD }
    ],
    siblings: [],
    spouses: []
  },
  {
    id: 'H-06WvsfJ',
    gender: FEMALE,
    parents: [{ id: '2DlrR0fK8', type: BLOOD }],
    children: [],
    siblings: [{ id: 'PXACjDxmR', type: BLOOD }],
    spouses: []
  },
  {
    id: '6vASIIxhd',
    gender: MALE,
    parents: [],
    children: [{ id: 'vRSjcaDGj', type: BLOOD }],
    siblings: [],
    spouses: [{ id: 'iFiwqrWx-', type: MARRIED }]
  },
  {
    id: 'iFiwqrWx-',
    gender: FEMALE,
    parents: [],
    children: [{ id: 'vRSjcaDGj', type: BLOOD }],
    siblings: [],
    spouses: [{ id: '6vASIIxhd', type: MARRIED }]
  },
  {
    id: 'HkqEDLvxE',
    gender: MALE,
    parents: [
      { id: '011jVS4rb', type: BLOOD },
      { id: 'PXACjDxmR', type: BLOOD }
    ],
    siblings: [
      { id: 'kuVISwh7w', type: BLOOD },
      { id: 'UIEjvLJMd', type: BLOOD },
      { id: 'ZVi8fWDBx', type: BLOOD }
    ],
    spouses: [],
    children: []
  },
  {
    id: '011jVS4rb',
    gender: MALE,
    parents: [
      { id: 'ypu71w9_Q', type: BLOOD },
      { id: 'GEf8zF7A4', type: BLOOD }
    ],
    children: [
      { id: 'HkqEDLvxE', type: BLOOD },
      { id: 'kuVISwh7w', type: BLOOD },
      { id: 'UIEjvLJMd', type: BLOOD },
      { id: 'ZVi8fWDBx', type: BLOOD }
    ],
    siblings: [],
    spouses: [{ id: 'PXACjDxmR', type: MARRIED }]
  },
  {
    id: 'PXACjDxmR',
    gender: FEMALE,
    parents: [{ id: '2DlrR0fK8', type: BLOOD }],
    children: [
      { id: 'HkqEDLvxE', type: BLOOD },
      { id: 'kuVISwh7w', type: BLOOD },
      { id: 'UIEjvLJMd', type: BLOOD },
      { id: 'ZVi8fWDBx', type: BLOOD }
    ],
    siblings: [{ id: 'H-06WvsfJ', type: BLOOD }],
    spouses: [{ id: '011jVS4rb', type: MARRIED }]
  },
  {
    id: 'kuVISwh7w',
    gender: MALE,
    parents: [
      { id: '011jVS4rb', type: BLOOD },
      { id: 'PXACjDxmR', type: BLOOD }
    ],
    children: [{ id: 'Fbc9iwnJl', type: BLOOD }],
    siblings: [
      { id: 'HkqEDLvxE', type: BLOOD },
      { id: 'UIEjvLJMd', type: BLOOD },
      { id: 'ZVi8fWDBx', type: BLOOD }
    ],
    spouses: [{ id: 'vRSjcaDGj', type: MARRIED }]
  },
  {
    id: 'UIEjvLJMd',
    gender: FEMALE,
    parents: [
      { id: '011jVS4rb', type: BLOOD },
      { id: 'PXACjDxmR', type: BLOOD }
    ],
    children: [
      { id: '6_OTJvbvS', type: BLOOD },
      { id: 'JhSCcdFEP', type: BLOOD },
      { id: '6hNxNY1-I', type: BLOOD }
    ],
    siblings: [
      { id: 'HkqEDLvxE', type: BLOOD },
      { id: 'kuVISwh7w', type: BLOOD },
      { id: 'ZVi8fWDBx', type: BLOOD }
    ],
    spouses: [{ id: 'RZbkr5vAi', type: MARRIED }]
  },
  {
    id: 'RZbkr5vAi',
    gender: MALE,
    parents: [],
    children: [
      { id: '6_OTJvbvS', type: BLOOD },
      { id: 'JhSCcdFEP', type: BLOOD },
      { id: '6hNxNY1-I', type: BLOOD }
    ],
    siblings: [],
    spouses: [{ id: 'UIEjvLJMd', type: MARRIED }]
  },
  {
    id: 'vRSjcaDGj',
    gender: FEMALE,
    parents: [
      { id: '6vASIIxhd', type: BLOOD },
      { id: 'iFiwqrWx-', type: BLOOD }
    ],
    children: [{ id: 'Fbc9iwnJl', type: BLOOD }],
    siblings: [],
    spouses: [{ id: 'kuVISwh7w', type: MARRIED }]
  },
  {
    id: 'Fbc9iwnJl',
    gender: FEMALE,
    parents: [
      { id: 'kuVISwh7w', type: BLOOD },
      { id: 'vRSjcaDGj', type: BLOOD }
    ],
    children: [],
    siblings: [],
    spouses: []
  },
  {
    id: '6_OTJvbvS',
    gender: MALE,
    parents: [
      { id: 'RZbkr5vAi', type: BLOOD },
      { id: 'UIEjvLJMd', type: BLOOD }
    ],
    children: [],
    siblings: [
      { id: 'JhSCcdFEP', type: BLOOD },
      { id: '6hNxNY1-I', type: BLOOD }
    ],
    spouses: []
  },
  {
    id: 'JhSCcdFEP',
    gender: FEMALE,
    parents: [
      { id: 'RZbkr5vAi', type: BLOOD },
      { id: 'UIEjvLJMd', type: BLOOD }
    ],
    children: [],
    siblings: [
      { id: '6_OTJvbvS', type: BLOOD },
      { id: '6hNxNY1-I', type: BLOOD }
    ],
    spouses: []
  },
  {
    id: '6hNxNY1-I',
    gender: MALE,
    parents: [
      { id: 'RZbkr5vAi', type: BLOOD },
      { id: 'UIEjvLJMd', type: BLOOD }
    ],
    children: [],
    siblings: [
      { id: '6_OTJvbvS', type: BLOOD },
      { id: 'JhSCcdFEP', type: BLOOD }
    ],
    spouses: []
  },
  {
    id: 'ZVi8fWDBx',
    gender: MALE,
    parents: [
      { id: '011jVS4rb', type: BLOOD },
      { id: 'PXACjDxmR', type: BLOOD }
    ],
    children: [],
    siblings: [
      { id: 'HkqEDLvxE', type: BLOOD },
      { id: 'kuVISwh7w', type: BLOOD },
      { id: 'UIEjvLJMd', type: BLOOD }
    ],
    spouses: [{ id: 'wJ1EBvc5m', type: MARRIED }]
  },
  {
    id: 'wJ1EBvc5m',
    gender: FEMALE,
    parents: [],
    children: [],
    siblings: [],
    spouses: [{ id: 'ZVi8fWDBx', type: MARRIED }]
  }
]; 