import React from 'react';
import { ExtNode } from 'relatives-tree/lib/types';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  node: ExtNode & {
    attributes?: {
      displayName?: string;
      imageUrl?: string;
      isBloodRelated?: boolean;
      profilePicture?: string;
    };
  };
  style?: React.CSSProperties;
  isSelected?: boolean;
}

const FamilyNode: React.FC<Props> = ({ node, style, isSelected }) => {
  const nodeStyle: React.CSSProperties = {
    ...style,
    backgroundColor: node.gender === 'male' ? '#e3f2fd' : '#fce4ec',
    border: isSelected ? '2px solid rgb(20 83 45)' : '1px solid #ccc',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '8px',
    boxShadow: isSelected 
      ? '0 4px 12px rgba(20, 83, 45, 0.2)' 
      : '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
    transition: 'all 0.3s cubic-bezier(.25,.8,.25,1)',
    cursor: 'pointer',
    gap: '6px',
    transform: isSelected ? 'scale(1.05)' : undefined,
    position: 'relative',
    width: '100%',
    height: '100%',
  };

  const initials = node.attributes?.displayName
    ? node.attributes.displayName
        .split(' ')
        .map((n: string) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';

  // Check if the node has any hidden relatives
  const hasHiddenRelatives = node.hasSubTree && (
    (node.children?.length > 0) || 
    (node.parents?.length > 0) || 
    (node.siblings?.length > 0) || 
    (node.spouses?.length > 0)
  );

  return (
    <div style={nodeStyle}>
      {/* Only show eye icon for non-blood relationships or if there are actually hidden relatives */}
      {(node.attributes?.isBloodRelated === false || hasHiddenRelatives) && (
        <div 
          className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-md"
          title={node.attributes?.isBloodRelated === false ? "Non-blood relationship" : "Has hidden relatives"}
        >
          <Eye className="h-3 w-3 text-gray-500" />
        </div>
      )}
      <Avatar className="h-12 w-12 select-none shrink-0">
        <AvatarImage 
          src={node.attributes?.profilePicture || "/avatar.svg"} 
          alt={node.attributes?.displayName || 'Member'} 
          draggable={false}
          className="pointer-events-none"
        />
        <AvatarFallback className="pointer-events-none">{initials}</AvatarFallback>
      </Avatar>
      <div className={cn(
        "text-center w-full",
        "min-h-[2.5rem] flex items-center justify-center"
      )}>
        <div 
          className={cn(
            "font-medium text-base leading-tight",
            "line-clamp-2",
            "break-words",
            "w-full max-w-[120px]"
          )}
          title={node.attributes?.displayName}
        >
          {node.attributes?.displayName || 'Unknown'}
        </div>
      </div>
    </div>
  );
};

export default FamilyNode; 