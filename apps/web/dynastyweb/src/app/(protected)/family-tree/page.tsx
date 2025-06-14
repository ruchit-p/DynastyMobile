'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { useOnboarding } from '@/context/OnboardingContext';
import { useSearchParams } from 'next/navigation';
import calcTree from "relatives-tree";
import type { Node, ExtNode, Connector } from 'relatives-tree/lib/types';
import { getFamilyTreeData, createFamilyMember, deleteFamilyMember, updateFamilyMember } from "@/utils/functionUtils";
import FamilyNode from '@/components/FamilyNode';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Minus, Plus, Settings, MoreVertical } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"

const WIDTH = 150;
const HEIGHT = 150;

type RelationType = 'parent' | 'spouse' | 'child';

interface AddMemberFormData {
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
  gender: string;
  phone?: string;
  email?: string;
  connectToChildren?: boolean;
  connectToSpouse?: boolean;
  connectToExistingParent?: boolean;
}

// Custom node type that extends the base Node type
interface CustomNode extends Omit<Node, 'placeholder'> {
  attributes?: {
    displayName: string;
    profilePicture?: string;
    familyTreeId: string;
    isBloodRelated: boolean;
    status?: string;
    treeOwnerId?: string;
    email?: string;
    phoneNumber?: string;
  };
}

interface FirestoreTimestamp {
  seconds: number;
  nanoseconds: number;
}

export default function FamilyTreePage() {
  const { currentUser, firestoreUser } = useAuth();
  const { hasCompletedOnboarding, isOnboardingLoading } = useOnboarding();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [treeData, setTreeData] = useState<Node[]>([]);
  const [selectedNode, setSelectedNode] = useState<ExtNode | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isViewSheetOpen, setIsViewSheetOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isFamilyManagementOpen, setIsFamilyManagementOpen] = useState(false);
  const [familyTreeData, setFamilyTreeData] = useState<{
    id: string;
    ownerUserID: string;
    memberUserIDs: string[];
    adminUserIDs: string[];
    treeName: string;
    createdAt: Date;
  } | null>(null);
  const [familyMembers, setFamilyMembers] = useState<Array<{
    id: string;
    displayName: string;
    profilePicture?: string;
    createdAt: Date | string;
    isAdmin: boolean;
    isOwner: boolean;
    // Member status can be calculated based on memberUserIDs and adminUserIDs
  }>>([]);
  const [memberEditTarget, setMemberEditTarget] = useState<string | null>(null);
  const [relationType, setRelationType] = useState<RelationType | null>(null);
  const [formData, setFormData] = useState<AddMemberFormData>({
    firstName: '',
    lastName: '',
    dateOfBirth: undefined,
    gender: '',
    phone: '',
    email: '',
    connectToChildren: true,
    connectToSpouse: true,
    connectToExistingParent: true,
  });
  const [viewFormData, setViewFormData] = useState<AddMemberFormData>({
    firstName: '',
    lastName: '',
    dateOfBirth: undefined,
    gender: '',
    phone: '',
    email: '',
    connectToChildren: false,
    connectToSpouse: false,
    connectToExistingParent: false,
  });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rootNode, setRootNode] = useState<string>(currentUser?.uid || '');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const DEBUG_MODE = false; // Debug flag - set to true to enable debug features
  // Add refs for touch handling
  const touchStartRef = useRef({ x: 0, y: 0 });
  const lastTouchRef = useRef({ x: 0, y: 0 });
  const isTouchActiveRef = useRef(false);
  const isMobileRef = useRef(false);
  // Add refs for pinch-to-zoom
  const previousTouchDistanceRef = useRef<number | null>(null);
  const initialScaleRef = useRef(1);
  // Add refs for mouse dragging
  const isDraggingRef = useRef(false);
  const mouseStartRef = useRef({ x: 0, y: 0 });
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const searchParams = useSearchParams();
  const isNewUser = searchParams.get('newUser') === 'true';
  const newUserCheckedRef = useRef(false);
  // Add refs for RAF-based position updates
  const rafRef = useRef<number | undefined>(undefined);
  const pendingPositionRef = useRef<{x: number, y: number} | null>(null);
  const currentPositionRef = useRef(position);

  // Keep position ref in sync
  useEffect(() => {
    currentPositionRef.current = position;
  }, [position]);

  // RAF-based position updater for smooth performance
  const updatePosition = useCallback((newPositionOrFunction: {x: number, y: number} | ((prev: {x: number, y: number}) => {x: number, y: number})) => {
    const newPosition = typeof newPositionOrFunction === 'function' 
      ? newPositionOrFunction(currentPositionRef.current)
      : newPositionOrFunction;
    
    pendingPositionRef.current = newPosition;
    currentPositionRef.current = newPosition; // Update ref immediately to prevent stale reads
    
    if (rafRef.current) return;
    
    rafRef.current = requestAnimationFrame(() => {
      if (pendingPositionRef.current) {
        setPosition(pendingPositionRef.current);
        pendingPositionRef.current = null;
      }
      rafRef.current = undefined;
    });
  }, []);

  const treeLayout = useMemo(
    () => calcTree(treeData, { rootId: rootNode, placeholders: false }),
    [treeData, rootNode]
  );

  // Track window dimensions for viewport calculations
  const [windowDimensions, setWindowDimensions] = useState(() => {
    if (typeof window !== 'undefined') {
      return { width: window.innerWidth, height: window.innerHeight };
    }
    return { width: 1200, height: 800 }; // Default fallback for SSR
  });

  // Handle window resize for viewport calculations
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setWindowDimensions({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Calculate visible nodes for viewport virtualization
  const visibleNodes = useMemo(() => {
    if (treeLayout.nodes.length === 0) return [];
    
    // Performance safeguard: if tree is extremely large, increase buffer to reduce filtering frequency
    const buffer = treeLayout.nodes.length > 5000 ? 400 : 200;
    
    // Prevent division by zero or extremely small scale values
    const safeScale = Math.max(scale, 0.001);
    
    // Calculate viewport bounds in tree coordinates
    const viewport = {
      left: (-position.x / safeScale) - buffer,
      top: (-position.y / safeScale) - buffer,
      right: (windowDimensions.width - position.x) / safeScale + buffer,
      bottom: (windowDimensions.height - position.y) / safeScale + buffer
    };
    
    // Filter nodes that intersect with the viewport
    return treeLayout.nodes.filter(node => {
      const nodeLeft = node.left * WIDTH;
      const nodeRight = nodeLeft + WIDTH;
      const nodeTop = node.top * HEIGHT;
      const nodeBottom = nodeTop + HEIGHT;
      
      return nodeRight >= viewport.left && 
             nodeLeft <= viewport.right &&
             nodeBottom >= viewport.top && 
             nodeTop <= viewport.bottom;
    });
  }, [treeLayout.nodes, position.x, position.y, scale, windowDimensions.width, windowDimensions.height]);

  // Check if we're on a mobile device
  useEffect(() => {
    // Simple mobile detection - this covers most mobile devices
    isMobileRef.current = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }, []);

  // Add non-passive touch event listeners for mobile devices
  useEffect(() => {
    const container = treeContainerRef.current;
    if (!container || !isMobileRef.current) return;

    // Non-passive touchmove handler to prevent default behavior
    const handleTouchMoveRaw = (e: TouchEvent) => {
      // Prevent default browser behavior (pull-to-refresh) for all touch events on the tree container
      if (isTouchActiveRef.current || e.touches.length === 2) {
        e.preventDefault();
      }
    };

    // Add non-passive event listener
    container.addEventListener('touchmove', handleTouchMoveRaw, { passive: false });
    
    // Disable pull-to-refresh by preventing touchstart default behavior
    const handleTouchStartRaw = (e: TouchEvent) => {
      if (e.touches.length === 1 || e.touches.length === 2) {
        // Only prevent default if the touch is happening inside the tree container
        // We still want to allow scrolling in other areas of the page
        e.preventDefault();
      }
    };

    container.addEventListener('touchstart', handleTouchStartRaw, { passive: false });

    // Clean up
    return () => {
      container.removeEventListener('touchmove', handleTouchMoveRaw);
      container.removeEventListener('touchstart', handleTouchStartRaw);
    };
  }, []);

  // Add a useEffect to apply and remove body class for the family tree page
  useEffect(() => {
    // Add class to body when component mounts
    document.body.classList.add('family-tree-page');
    
    // Remove class when component unmounts
    return () => {
      document.body.classList.remove('family-tree-page');
    };
  }, []);

  // Add a useEffect to set overscroll behavior CSS property to prevent pull-to-refresh
  useEffect(() => {
    // Apply overscroll-behavior to the document body and html to prevent pull-to-refresh
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehavior = 'none';
    
    // Clean up when component unmounts
    return () => {
      document.body.style.overscrollBehavior = '';
      document.documentElement.style.overscrollBehavior = '';
    };
  }, []);

  useEffect(() => {
    // Only force onboarding check for new Google users once
    if (isNewUser && !newUserCheckedRef.current) {
      newUserCheckedRef.current = true;

      // This will force a delay to ensure the onboarding context is fully initialized
      const timer = setTimeout(() => {
        // The OnboardingContext should automatically detect the onboarding status
        // and show the onboarding form if needed
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [isNewUser]);

  const fetchFamilyTreeData = useCallback(async () => {
    if (!currentUser) return;
    

    
    // Don't try to fetch family tree data if onboarding isn't completed
    if (!hasCompletedOnboarding) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { treeNodes } = await getFamilyTreeData(currentUser.uid);

      setTreeData([...treeNodes]); // Convert readonly array to mutable array

      if (treeNodes?.length === 0) {
        // No tree nodes returned - this might indicate a data issue
      }
    } catch (error) {
      console.error("❌ Failed to load family tree:", error);
      // Add user-friendly error handling
      if (error instanceof Error) {
        console.error("Error details:", error.message);
        // If it's a permission or not found error, show a helpful message
        if (error.message.includes('not found') || error.message.includes('permission')) {
          // Force a check of onboarding status
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [currentUser, hasCompletedOnboarding]);

  // Fetch family tree admin data and members
  const fetchFamilyManagementData = useCallback(async () => {
    if (!currentUser || !hasCompletedOnboarding) return;

    try {
      setLoading(true);
      
      // Call the Cloud Function instead of direct Firebase access
      const { getFamilyManagementData } = await import('@/utils/functionUtils');
      const data = await getFamilyManagementData();
      
      if (!data || !data.tree || !data.members) {
        throw new Error('Failed to retrieve family management data');
      }
      
      // Set the tree data from the function result
      setFamilyTreeData({
        id: data.tree.id,
        ownerUserID: data.tree.ownerUserId, // Note: converting from camelCase to our local naming convention
        memberUserIDs: data.tree.memberUserIds || [],
        adminUserIDs: data.tree.adminUserIds || [],
        treeName: data.tree.treeName,
        createdAt: data.tree.createdAt?.toDate ? data.tree.createdAt.toDate() : new Date(),
      });
      
      // Set the members from the function result
      const formattedMembers = data.members.map(member => ({
        id: member.id,
        displayName: member.displayName,
        profilePicture: member.profilePicture || undefined,
        createdAt: member.createdAt?.toDate ? member.createdAt.toDate() : new Date(),
        isAdmin: member.isAdmin,
        isOwner: member.isOwner
      }));
      
      setFamilyMembers(formattedMembers);
    } catch {
      // Toast removed as requested
      if (!hasCompletedOnboarding) {
        // Family management data not available during onboarding - suppressing error
      } else {
        console.error('Error fetching family management data');
      }
    } finally {
      setLoading(false);
    }
  }, [currentUser, hasCompletedOnboarding]);

  useEffect(() => {
    
    // Don't fetch data if we're still loading onboarding status
    if (isOnboardingLoading) {
      return;
    }
    
    // Only fetch family tree data if onboarding is completed
    if (hasCompletedOnboarding && currentUser) {
      void fetchFamilyTreeData();
    } else if (!hasCompletedOnboarding && currentUser) {
      // The OnboardingContext will handle showing the onboarding form
      // No need to reload the page - just wait for onboarding to complete
    }
  }, [fetchFamilyTreeData, hasCompletedOnboarding, currentUser, isOnboardingLoading]);

  // Calculate optimal zoom level to fit the entire tree
  const calculateOptimalZoom = useCallback(() => {
    if (treeLayout.nodes.length === 0) return 1;

    const headerHeight = 80;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight - headerHeight;

    // Calculate the total tree dimensions
    const treeWidth = treeLayout.canvas.width * WIDTH;
    const treeHeight = treeLayout.canvas.height * HEIGHT;

    // Calculate scale needed for both width and height
    const scaleX = (viewportWidth * 0.9) / treeWidth; // 90% of viewport width
    const scaleY = (viewportHeight * 0.9) / treeHeight; // 90% of viewport height

    // Use the smaller scale to ensure the entire tree fits
    const optimalScale = Math.min(scaleX, scaleY);

    // Clamp the scale between 0.1 and 1
    return Math.min(Math.max(optimalScale, 0.1), 1);
  }, [treeLayout]);

  // Effect to set initial zoom and center tree when data is loaded
  useEffect(() => {
    if (treeLayout.nodes.length > 0) {
      const optimalScale = calculateOptimalZoom();
      setScale(optimalScale);

      const headerHeight = 80;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight - headerHeight;

      const treeWidth = treeLayout.canvas.width * WIDTH;
      const treeHeight = treeLayout.canvas.height * HEIGHT;
      
      const x = (viewportWidth - treeWidth * optimalScale) / 2;
      const y = (viewportHeight - treeHeight * optimalScale) / 2;

      setPosition({ x, y });
    }
  }, [treeLayout, calculateOptimalZoom, DEBUG_MODE]);

  // Function to center the tree or a specific node
  const centerTree = useCallback((nodeId?: string) => {
    if (treeData.length === 0) return;

    const headerHeight = 80;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight - headerHeight;
    const minTopMargin = 100; // Minimum distance from top of viewport

    const layout = nodeId
      ? calcTree(treeData, { rootId: nodeId, placeholders: false })
      : treeLayout;

    if (nodeId) {
      // Find the specific node to center
      const targetNode = layout.nodes.find(n => n.id === nodeId);
      if (targetNode) {
        // Calculate the absolute position of the node in the tree
        const nodeX = targetNode.left * WIDTH;
        const nodeY = targetNode.top * HEIGHT;

        // Center horizontally
        const x = viewportWidth / 2 - nodeX * scale;
        
        // For vertical positioning, ensure the node isn't too close to the top
        let y = viewportHeight / 2 - nodeY * scale;
        
        // If the node would be positioned above minTopMargin, adjust y to maintain minimum margin
        const nodeScreenY = nodeY * scale + y;
        if (nodeScreenY < minTopMargin) {
          y += (minTopMargin - nodeScreenY);
        }

        setPosition({ x, y });
      }
    } else {
      // For initial tree centering, calculate the center point of the tree
      const treeWidth = layout.canvas.width * WIDTH * scale;
      const treeHeight = layout.canvas.height * HEIGHT * scale;

      // Position the tree in the center of the viewport
      const x = (viewportWidth - treeWidth) / 2;
      let y = (viewportHeight - treeHeight) / 2;

      // Ensure the top of the tree isn't too close to the top of the viewport
      if (y < minTopMargin) {
        y = minTopMargin;
      }

      setPosition({ x, y });
    }
  }, [treeLayout, treeData, scale]);

  // Effect to center tree on initial load and when tree data changes
  useEffect(() => {
    centerTree();
  }, [treeData, scale, centerTree]);

  // Effect to handle centering when root node changes
  useEffect(() => {
    if (!rootNode || treeLayout.nodes.length === 0) return;

    const layout = treeLayout;

    const targetNode = layout.nodes.find(n => n.id === rootNode);
    if (!targetNode) return;

    const headerHeight = 80;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight - headerHeight;
    const viewportCenterX = viewportWidth / 2;
    const viewportCenterY = viewportHeight / 2;

    const nodeX = targetNode.left * WIDTH;
    const nodeY = targetNode.top * HEIGHT;

    const x = viewportCenterX - (nodeX * scale);
    const y = viewportCenterY - (nodeY * scale);



    setPosition({ x, y });
  }, [rootNode, treeLayout, scale, DEBUG_MODE]);

  // Add debug info for tree wrapper dimensions
  const getTreeWrapperDebugInfo = useCallback(() => {
    if (!treeLayout.nodes.length) return null;

    const layout = treeLayout;

    return {
      wrapperWidth: Math.max(layout.canvas.width * WIDTH, window.innerWidth),
      wrapperHeight: Math.max(layout.canvas.height * HEIGHT, window.innerHeight),
      transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
      layout: {
        canvasWidth: layout.canvas.width,
        canvasHeight: layout.canvas.height,
        nodeCount: layout.nodes.length
      }
    };
  }, [treeLayout, position.x, position.y, scale]);

  const handleNodeClick = (node: ExtNode, isClick: boolean) => {
    if (!isClick) return;

    if (selectedNode?.id === node.id) {
      setSelectedNode(null);
      return;
    }
    

    
    setSelectedNode(node);
    setRootNode(node.id);
  };

  const handleAddMember = (type: RelationType) => {
    setRelationType(type);
    setIsSheetOpen(true);
  };

  const canDeleteMember = (node: ExtNode): boolean => {
    // Can't delete self
    if (node.id === currentUser?.uid) return false;

    const isLeafMember = (member: Node): boolean => {
      // If this member has no children, they are a leaf
      if (!member.children || member.children.length === 0) return true;

      // Check if all children are also leaves
      return member.children.every(child => {
        const childNode = treeData.find(n => n.id === child.id);
        return childNode ? isLeafMember(childNode) : true;
      });
    };

    // Find the full node data from treeData
    const fullNode = treeData.find(n => n.id === node.id);
    if (!fullNode) return false;

    // Check if the node is a leaf in the tree
    const isLeaf = isLeafMember(fullNode);
    
    // If the member has an account (status !== 'pending'), only tree owner can delete
    const memberData = (fullNode as CustomNode).attributes;
    const hasAccount = memberData?.status && memberData.status !== 'pending';
    const isOwner = currentUser?.uid === memberData?.treeOwnerId;

    if (hasAccount && !isOwner) {
      setDeleteError(
        "Cannot delete members with active accounts. Only the tree owner can remove members with accounts."
      );
      return false;
    }

    if (!isLeaf) {
      setDeleteError(
        "This member has descendants in the family tree. Please remove all descendants first."
      );
      return false;
    }

    return true;
  };

  const handleDeleteMember = async () => {
    if (!selectedNode || !currentUser || selectedNode.id === currentUser.uid) return;
    const node = selectedNode as CustomNode;

    if (!canDeleteMember(selectedNode)) {
      setDeleteError("Cannot delete members who have children. Please remove all children first.");
      return;
    }

    try {
      setSaving(true);
      
      if (!node.attributes?.familyTreeId) {
        throw new Error('Family tree ID not found');
      }

      await deleteFamilyMember(
        node.id,
        node.attributes.familyTreeId,
        currentUser.uid
      );

      toast({
        title: "Member Deleted",
        description: "The family member has been removed from the tree.",
      });
      await fetchFamilyTreeData();
      setShowDeleteDialog(false);
    } catch (error) {
      console.error("Error deleting family member:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete family member. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
      setSelectedNode(null);
      setDeleteError(null);
    }
  };

  const handleSave = async () => {
    if (!selectedNode || !currentUser || !relationType) return;
    const node = selectedNode as CustomNode;

    // Validate required fields
    if (!formData.firstName.trim()) {
      toast({
        title: "Error",
        description: "First name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.lastName.trim()) {
      toast({
        title: "Error",
        description: "Last name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.gender) {
      toast({
        title: "Error",
        description: "Gender is required.",
        variant: "destructive",
      });
      return;
    }

    if (!node.attributes?.familyTreeId) {
      toast({
        title: "Error",
        description: "Family tree ID not found. Please try again.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);

      // Create the new family member using the Cloud Function
      const userData = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        displayName: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
        dateOfBirth: formData.dateOfBirth || new Date(),
        gender: formData.gender,
        status: 'pending',
        familyTreeId: node.attributes.familyTreeId,
        phone: formData.phone?.trim(),
        email: formData.email?.trim(),
      };

      await createFamilyMember(
        userData,
        relationType,
        node.id,
        {
          connectToChildren: formData.connectToChildren,
          connectToSpouse: formData.connectToSpouse,
          connectToExistingParent: formData.connectToExistingParent,
        }
      );

      // Fetch updated tree data before closing the sheet
      await fetchFamilyTreeData();
      
      toast({
        title: "Success",
        description: "New family member has been added to the tree.",
      });

      // Reset form and close sheet after data is refreshed
      setFormData({
        firstName: '',
        lastName: '',
        dateOfBirth: undefined,
        gender: '',
        phone: '',
        email: '',
        connectToChildren: true,
        connectToSpouse: true,
        connectToExistingParent: true,
      });
      setSelectedNode(null);
      setRelationType(null);
      setIsSheetOpen(false);
    } catch (error) {
      console.error("Error adding family member:", error);
      toast({
        title: "Error",
        description: "Failed to add family member. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!treeContainerRef.current) return;

    // Get the current scroll position
    const currentX = position.x;
    const currentY = position.y;

    // Calculate new position based on wheel movement
    // For diagonal scrolling support, we use both deltaX and deltaY
    const newX = currentX - e.deltaX;
    const newY = currentY - e.deltaY;

    // Update position using RAF for smooth performance
    updatePosition({ x: newX, y: newY });
  };

  // Update the handleTouchStart function to better handle touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobileRef.current) return;
    
    if (e.touches.length === 1) {
      // Single touch - panning
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
      isTouchActiveRef.current = true;
      previousTouchDistanceRef.current = null;
    } else if (e.touches.length === 2) {
      // Two touches - pinch-to-zoom
      isTouchActiveRef.current = false;
      
      // Calculate initial distance between two fingers
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      
      previousTouchDistanceRef.current = distance;
      initialScaleRef.current = scale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isMobileRef.current) return;
    
    if (isTouchActiveRef.current && e.touches.length === 1) {
      // Handle panning with one finger
      const touch = e.touches[0];
      
      // Calculate the distance moved since the last touch event
      const deltaX = touch.clientX - lastTouchRef.current.x;
      const deltaY = touch.clientY - lastTouchRef.current.y;
      
      // Update position based on the touch movement using RAF
      updatePosition(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }));
      
      // Update the last touch position
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
    } else if (e.touches.length === 2 && previousTouchDistanceRef.current !== null) {
      // Handle pinch-to-zoom with two fingers
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      
      // Calculate current distance between fingers
      const currentDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      
      // Calculate zoom scale factor based on the change in distance
      const scaleFactor = currentDistance / previousTouchDistanceRef.current;
      
      // Calculate new scale value
      const newScale = Math.min(Math.max(initialScaleRef.current * scaleFactor, 0.1), 2);
      
      // Update scale
      setScale(newScale);
      
      // Update the previous distance for the next move event
      previousTouchDistanceRef.current = currentDistance;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isMobileRef.current) return;
    
    if (e.touches.length === 0) {
      // All fingers lifted
      isTouchActiveRef.current = false;
      previousTouchDistanceRef.current = null;
    } else if (e.touches.length === 1) {
      // One finger remains, reset for panning
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
      isTouchActiveRef.current = true;
      previousTouchDistanceRef.current = null;
    }
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.1, 2));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.1, 0.1));
  };

  // Mouse event handlers for desktop dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only initiate drag if not on a mobile device and left mouse button is pressed
    if (isMobileRef.current || e.button !== 0) return;
    
    // Prevent dragging if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('[role="button"]')) {
      return;
    }
    
    isDraggingRef.current = true;
    setIsDragging(true);
    mouseStartRef.current = { x: e.clientX, y: e.clientY };
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    
    // Prevent text selection during drag
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Only process if we're dragging on desktop
    if (!isDraggingRef.current || isMobileRef.current) return;
    
    // Calculate the distance moved since the last mouse event
    const deltaX = e.clientX - lastMouseRef.current.x;
    const deltaY = e.clientY - lastMouseRef.current.y;
    
    // Update position based on the mouse movement using RAF
    updatePosition(prev => ({
      x: prev.x + deltaX,
      y: prev.y + deltaY
    }));
    
    // Update the last mouse position
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    // Only process if we were dragging on desktop
    if (!isDraggingRef.current || isMobileRef.current) return;
    
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  // Add global mouse listeners for mouse up (in case mouse leaves the container)
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
      }
    };
    
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // Cleanup RAF on component unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // Function to handle viewing a family member
  const handleViewMember = () => {
    if (!selectedNode && !memberEditTarget) return;
    
    // If we have a selectedNode, use that
    if (selectedNode) {
      const node = selectedNode as CustomNode;
      const memberData = node.attributes;
      
      if (!memberData) return;
      
      // Extract the member's data to populate the form
      const nameParts = memberData.displayName?.split(' ') || ['', ''];
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      setViewFormData({
        firstName,
        lastName,
        gender: node.gender,
        dateOfBirth: undefined,
        phone: memberData.phoneNumber || '',
        email: memberData.email || '',
        connectToChildren: false,
        connectToSpouse: false,
        connectToExistingParent: false,
      });
    } 
    // If we have a memberEditTarget from family management, use that
    else if (memberEditTarget) {
      // Find the member in the familyMembers array
      const member = familyMembers.find(m => m.id === memberEditTarget);
      if (!member) return;
      
      // Find a node in treeData with this id
      const node = treeData.find(n => n.id === memberEditTarget);
      if (!node) return;
      
      // Set selectedNode for the update function to work
      setSelectedNode(node as ExtNode);
      
      // Extract firstName and lastName from displayName
      const nameParts = member.displayName.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      // Use the node attributes if available
      const customNode = node as CustomNode;
      
      setViewFormData({
        firstName,
        lastName,
        gender: node.gender,
        dateOfBirth: undefined,
        phone: customNode.attributes?.phoneNumber || '',
        email: customNode.attributes?.email || '',
        connectToChildren: false,
        connectToSpouse: false,
        connectToExistingParent: false,
      });
      
      // Reset memberEditTarget
      setMemberEditTarget(null);
    }
    
    setIsEditMode(false);
    setIsViewSheetOpen(true);
  };
  
  // Function to save updates to a family member
  const handleUpdateMember = async () => {
    if (!selectedNode || !currentUser) return;
    const node = selectedNode as CustomNode;
    
    // Validate required fields
    if (!viewFormData.firstName.trim()) {
      toast({
        title: "Error",
        description: "First name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!viewFormData.lastName.trim()) {
      toast({
        title: "Error",
        description: "Last name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!viewFormData.gender) {
      toast({
        title: "Error",
        description: "Gender is required.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setSaving(true);
      
      // Get the full node data from treeData
      const fullNode = treeData.find(n => n.id === node.id) as CustomNode;
      if (!fullNode?.attributes?.familyTreeId) {
        throw new Error('Family tree ID not found');
      }
      
      // Call the updateFamilyMember function
      const result = await updateFamilyMember(
        node.id,
        {
          firstName: viewFormData.firstName.trim(),
          lastName: viewFormData.lastName.trim(),
          displayName: `${viewFormData.firstName.trim()} ${viewFormData.lastName.trim()}`,
          gender: viewFormData.gender,
          phone: viewFormData.phone?.trim(),
          email: viewFormData.email?.trim(),
        },
        fullNode.attributes.familyTreeId
      );
      
      if (result.success) {
        toast({
          title: "Success",
          description: "Family member updated successfully.",
          duration: 5000,
        });
        
        // Reset UI state
        setIsEditMode(false);
        setIsViewSheetOpen(false);
        
        // Fetch updated family tree data
        await fetchFamilyTreeData();
      } else {
        throw new Error("Failed to update family member");
      }
      
    } catch (error) {
      console.error("Error updating family member:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update family member",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setSaving(false);
    }
  };

  // Function to promote a member to admin status
  const handlePromoteToAdmin = async (memberId: string) => {
    if (!currentUser || !familyTreeData) return;
    
    try {
      setSaving(true);
      
      // Call the promoteToAdmin function
      const { promoteToAdmin } = await import('@/utils/functionUtils');
      const result = await promoteToAdmin(memberId, familyTreeData.id, currentUser.uid);
      
      if (result.success) {
        toast({
          title: "Success",
          description: result.message || "Member has been promoted to admin.",
          duration: 3000,
        });
        
        // Refresh data
        await fetchFamilyManagementData();
      } else {
        throw new Error("Failed to promote member");
      }
      
    } catch (error) {
      console.error("Error promoting member to admin:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to promote member. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };
  
  // Function to demote an admin to member status
  const handleDemoteToMember = async (memberId: string) => {
    if (!currentUser || !familyTreeData) return;
    
    // Cannot demote the owner
    if (memberId === familyTreeData.ownerUserID) {
      toast({
        title: "Error",
        description: "Cannot demote the family tree owner.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setSaving(true);
      
      // Call the demoteToMember function
      const { demoteToMember } = await import('@/utils/functionUtils');
      const result = await demoteToMember(memberId, familyTreeData.id, currentUser.uid);
      
      if (result.success) {
        toast({
          title: "Success",
          description: result.message || "Admin has been demoted to member.",
          duration: 3000,
        });
        
        // Refresh data
        await fetchFamilyManagementData();
      } else {
        throw new Error("Failed to demote admin");
      }
      
    } catch (error) {
      console.error("Error demoting admin to member:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to demote admin. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Effect to fetch family management data when the settings panel is opened
  useEffect(() => {
    if (isFamilyManagementOpen) {
      void fetchFamilyManagementData();
    }
  }, [isFamilyManagementOpen, fetchFamilyManagementData]);

  if (loading) {
    return (
      <ProtectedRoute>
        <main className="family-tree-container w-screen">
          <div className="flex items-center justify-center w-full h-full">
            <Spinner className="text-primary" />
          </div>
        </main>
      </ProtectedRoute>
    );
  }

  if (!currentUser) {
    return (
      <ProtectedRoute>
        <main className="family-tree-container w-screen">
          <div className="flex flex-col items-center justify-center w-full h-full gap-4">
            <h2 className="text-xl font-semibold">Not Authenticated</h2>
            <p className="text-gray-600">Please sign in to view your family tree.</p>
          </div>
        </main>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <main className="family-tree-container w-screen min-h-screen pt-20 flex items-center justify-center overflow-hidden relative">
        {/* Debug center point */}
        {DEBUG_MODE && (
          <div 
            className="fixed w-4 h-4 bg-red-500 rounded-full z-50"
            style={{ 
              left: '50%', 
              top: '50%',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none'
            }} 
          />
        )}
        
        {/* Admin Settings Button - only visible to admins */}
        {(firestoreUser?.isAdmin || (familyTreeData && (currentUser.uid === familyTreeData.ownerUserID || familyTreeData.adminUserIDs.includes(currentUser.uid)))) && (
          <div className="fixed top-20 left-4 z-10 py-4">
            <Button 
              variant="outline" 
              onClick={() => setIsFamilyManagementOpen(true)}
              className="flex items-center gap-2"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Family Management</span>
            </Button>
          </div>
        )}
        
        {/* Zoom Controls */}
        <div className="fixed bottom-8 right-8 flex flex-col gap-2 z-20">
          <Button
            variant="outline"
            size="icon"
            onClick={handleZoomIn}
            className="rounded-full h-10 w-10"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleZoomOut}
            className="rounded-full h-10 w-10"
          >
            <Minus className="h-4 w-4" />
          </Button>
        </div>

        {selectedNode && (
          <div className="fixed top-20 right-4 z-10 py-4 flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleViewMember}
            >
              View Family Member
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="default">Add Family Member</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => handleAddMember('parent')}>
                  Add Parent
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleAddMember('spouse')}>
                  Add Spouse
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleAddMember('child')}>
                  Add Child
                </DropdownMenuItem>
                {selectedNode.id !== currentUser?.uid && (
                  <DropdownMenuItem
                    className={cn(
                      "text-red-600",
                      !canDeleteMember(selectedNode) && "opacity-50 cursor-not-allowed"
                    )}
                    onSelect={() => {
                      if (canDeleteMember(selectedNode)) {
                        setShowDeleteDialog(true);
                      } else {
                        setDeleteError("Cannot delete members who have children. Please remove all children first.");
                        toast({
                          variant: "destructive",
                          title: "Cannot Delete Member",
                          description: "Members with children cannot be deleted. Please remove all children first."
                        });
                      }
                    }}
                  >
                    Delete Member
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetContent className="sm:max-w-[425px] md:max-w-[525px] bg-white overflow-y-auto" hideCloseButton={true}>
            <SheetHeader className="border-b pb-4 mb-2 sticky top-0 bg-white z-10">
              <SheetTitle className="text-[#0A5C36] text-xl font-semibold">Add {relationType?.charAt(0).toUpperCase()}{relationType?.slice(1)}</SheetTitle>
            </SheetHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
                <Label htmlFor="firstName" className="sm:text-right flex items-center sm:justify-end gap-1 text-gray-600 text-sm">
                  First Name<span className="text-red-500">*</span>
                </Label>
                <Input
                  id="firstName"
                  className="col-span-1 sm:col-span-3 border-[#0A5C36]/20 focus:ring-[#0A5C36]/20 focus:border-[#0A5C36]"
                  value={formData.firstName}
                  onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  tabIndex={1}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
                <Label htmlFor="lastName" className="sm:text-right flex items-center sm:justify-end gap-1 text-gray-600 text-sm">
                  Last Name<span className="text-red-500">*</span>
                </Label>
                <Input
                  id="lastName"
                  className="col-span-1 sm:col-span-3 border-[#0A5C36]/20 focus:ring-[#0A5C36]/20 focus:border-[#0A5C36]"
                  value={formData.lastName}
                  onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  tabIndex={2}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
                <Label htmlFor="gender" className="sm:text-right flex items-center sm:justify-end gap-1 text-gray-600 text-sm">
                  Gender<span className="text-red-500">*</span>
                </Label>
                <div className="col-span-1 sm:col-span-3">
                  <Select
                    value={formData.gender}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, gender: value }))}
                  >
                    <SelectTrigger className="w-full border-[#0A5C36]/20 focus:ring-[#0A5C36]/20" tabIndex={3}>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
                <Label htmlFor="dateOfBirth" className="sm:text-right flex items-center sm:justify-end text-gray-600 text-sm">
                  Date of Birth
                </Label>
                <div className="col-span-1 sm:col-span-3 flex flex-wrap gap-2">
                  <Select
                    value={formData.dateOfBirth?.getMonth()?.toString()}
                    onValueChange={(value) => {
                      const newDate = formData.dateOfBirth || new Date();
                      newDate.setMonth(parseInt(value));
                      setFormData(prev => ({ ...prev, dateOfBirth: new Date(newDate) }));
                    }}
                  >
                    <SelectTrigger className="w-[110px] border-[#0A5C36]/20 focus:ring-[#0A5C36]/20" tabIndex={4}>
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {new Date(0, i).toLocaleString('default', { month: 'long' })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={formData.dateOfBirth?.getDate()?.toString()}
                    onValueChange={(value) => {
                      const newDate = formData.dateOfBirth || new Date();
                      newDate.setDate(parseInt(value));
                      setFormData(prev => ({ ...prev, dateOfBirth: new Date(newDate) }));
                    }}
                  >
                    <SelectTrigger className="w-[90px] border-[#0A5C36]/20 focus:ring-[#0A5C36]/20" tabIndex={5}>
                      <SelectValue placeholder="Day" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 31 }, (_, i) => (
                        <SelectItem key={i} value={(i + 1).toString()}>
                          {i + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={formData.dateOfBirth?.getFullYear()?.toString()}
                    onValueChange={(value) => {
                      const newDate = formData.dateOfBirth || new Date();
                      newDate.setFullYear(parseInt(value));
                      setFormData(prev => ({ ...prev, dateOfBirth: new Date(newDate) }));
                    }}
                  >
                    <SelectTrigger className="w-[100px] border-[#0A5C36]/20 focus:ring-[#0A5C36]/20" tabIndex={6}>
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 121 }, (_, i) => (
                        <SelectItem key={i} value={(new Date().getFullYear() - i).toString()}>
                          {new Date().getFullYear() - i}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
                <Label htmlFor="phone" className="sm:text-right flex items-center sm:justify-end text-gray-600 text-sm">
                  Phone 
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  className="col-span-1 sm:col-span-3 border-[#0A5C36]/20 focus:ring-[#0A5C36]/20 focus:border-[#0A5C36]"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="Enter phone number"
                  tabIndex={7}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
                <Label htmlFor="email" className="sm:text-right flex items-center sm:justify-end text-gray-600 text-sm">
                  Email 
                </Label>
                <Input
                  id="email"
                  type="email"
                  className="col-span-1 sm:col-span-3 border-[#0A5C36]/20 focus:ring-[#0A5C36]/20 focus:border-[#0A5C36]"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="Enter email address"
                  tabIndex={8}
                />
              </div>
              {relationType === 'spouse' && (selectedNode?.children?.length ?? 0) > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4 mt-2">
                  <Label htmlFor="connectToChildren" className="sm:text-right flex items-center sm:justify-end text-gray-600 text-sm">
                    Connect to Children
                  </Label>
                  <div className="col-span-1 sm:col-span-3 flex items-center">
                    <input
                      type="checkbox"
                      id="connectToChildren"
                      className="mr-2 h-4 w-4 rounded border-gray-300 text-[#0A5C36] focus:ring-[#0A5C36]"
                      checked={formData.connectToChildren}
                      onChange={(e) => setFormData(prev => ({ ...prev, connectToChildren: e.target.checked }))}
                    />
                    <Label htmlFor="connectToChildren" className="text-sm">
                      Connect to spouse&apos;s existing children
                    </Label>
                  </div>
                </div>
              )}
              {relationType === 'child' && (selectedNode?.spouses?.length ?? 0) > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4 mt-2">
                  <Label htmlFor="connectToSpouse" className="sm:text-right flex items-center sm:justify-end text-gray-600 text-sm">
                    Connect to Spouse
                  </Label>
                  <div className="col-span-1 sm:col-span-3 flex items-center">
                    <input
                      type="checkbox"
                      id="connectToSpouse"
                      className="mr-2 h-4 w-4 rounded border-gray-300 text-[#0A5C36] focus:ring-[#0A5C36]"
                      checked={formData.connectToSpouse}
                      onChange={(e) => setFormData(prev => ({ ...prev, connectToSpouse: e.target.checked }))}
                    />
                    <Label htmlFor="connectToSpouse" className="text-sm">
                      Add child to spouse as well
                    </Label>
                  </div>
                </div>
              )}
              {relationType === 'parent' && (selectedNode?.parents?.length ?? 0) > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4 mt-2">
                  <Label htmlFor="connectToExistingParent" className="sm:text-right flex items-center sm:justify-end text-gray-600 text-sm">
                    Connect Parents
                  </Label>
                  <div className="col-span-1 sm:col-span-3 flex items-center">
                    <input
                      type="checkbox"
                      id="connectToExistingParent"
                      className="mr-2 h-4 w-4 rounded border-gray-300 text-[#0A5C36] focus:ring-[#0A5C36]"
                      checked={formData.connectToExistingParent}
                      onChange={(e) => setFormData(prev => ({ ...prev, connectToExistingParent: e.target.checked }))}
                    />
                    <Label htmlFor="connectToExistingParent" className="text-sm">
                      Connect as spouse to existing parent
                    </Label>
                  </div>
                </div>
              )}
            </div>
            <SheetFooter className="border-t pt-4 mt-2 sticky bottom-0 bg-white z-10 pb-6">
              <div className="flex gap-3 w-full">
                <Button
                  variant="outline"
                  onClick={() => setIsSheetOpen(false)}
                  disabled={saving}
                  className="flex-1 border-gray-200 hover:bg-gray-50"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleSave} 
                  disabled={saving}
                  className="flex-1 bg-[#0A5C36] hover:bg-[#0A5C36]/90 text-white transition-colors"
                >
                  {saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
                  Save
                </Button>
              </div>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {/* View Family Member Sheet */}
        <Sheet open={isViewSheetOpen} onOpenChange={setIsViewSheetOpen}>
          <SheetContent className="sm:max-w-[425px] md:max-w-[525px] bg-white border-l border-[#0A5C36]/10 overflow-y-auto" hideCloseButton={true}>
            <SheetHeader className="border-b pb-4 mb-2 sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between w-full">
                <SheetTitle className="text-[#0A5C36] text-xl font-semibold">
                  {isEditMode ? "Edit Member Details" : "Family Member Details"}
                </SheetTitle>
                {/* Edit toggle for admins */}
                {(currentUser?.uid === (selectedNode as CustomNode)?.attributes?.treeOwnerId || firestoreUser?.isAdmin) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditMode(prev => !prev)}
                    className="border-[#0A5C36] text-[#0A5C36] hover:bg-[#0A5C36]/5 transition-colors"
                  >
                    {isEditMode ? "View Mode" : "Edit Mode"}
                  </Button>
                )}
              </div>
            </SheetHeader>
            
            <div className="py-4">
              {/* Profile Card */}
              <div className="bg-[#F9FAFB] rounded-lg p-5 shadow-sm border border-gray-100 mb-6">
                <div className="flex justify-center mb-5">
                  <div className="h-24 w-24 rounded-full bg-[#0A5C36] flex items-center justify-center text-white text-xl font-semibold shadow-md">
                    {viewFormData.firstName.charAt(0)}{viewFormData.lastName.charAt(0)}
                  </div>
                </div>
                <div className="text-center mb-4">
                  <h3 className="text-xl font-semibold text-[#0A5C36]">{viewFormData.firstName} {viewFormData.lastName}</h3>
                  <p className="text-sm mt-1">
                    {(selectedNode as CustomNode)?.attributes?.isBloodRelated ? 
                      <span className="inline-flex items-center gap-1 text-[#C4A55C] font-medium">Blood Relative <span className="inline-block w-2 h-2 rounded-full bg-[#C4A55C]"></span></span> : 
                      'Non-blood Relative'}
                  </p>
                </div>
              </div>
              
              {/* Info section */}
              <div className="space-y-5">
                {isEditMode ? (
                  /* Edit mode layout - improved responsive design */
                  <>
                    <div className="space-y-4">
                      <h4 className="text-[#0A5C36] font-medium text-lg">Personal Information</h4>
                      
                      <div className="space-y-4 sm:space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-3 items-start sm:items-center">
                          <Label htmlFor="viewFirstName" className="sm:col-span-1 flex items-center text-gray-600 text-sm sm:text-right sm:justify-end">
                            First Name<span className="text-red-500 ml-1">*</span>
                          </Label>
                          <div className="sm:col-span-3">
                            <Input
                              id="viewFirstName"
                              className="border-[#0A5C36]/20 focus:ring-[#0A5C36]/20 focus:border-[#0A5C36] w-full"
                              value={viewFormData.firstName}
                              onChange={(e) => setViewFormData(prev => ({ ...prev, firstName: e.target.value }))}
                              tabIndex={1}
                            />
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-3 items-start sm:items-center">
                          <Label htmlFor="viewLastName" className="sm:col-span-1 flex items-center text-gray-600 text-sm sm:text-right sm:justify-end">
                            Last Name<span className="text-red-500 ml-1">*</span>
                          </Label>
                          <div className="sm:col-span-3">
                            <Input
                              id="viewLastName"
                              className="border-[#0A5C36]/20 focus:ring-[#0A5C36]/20 focus:border-[#0A5C36] w-full"
                              value={viewFormData.lastName}
                              onChange={(e) => setViewFormData(prev => ({ ...prev, lastName: e.target.value }))}
                              tabIndex={2}
                            />
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-3 items-start sm:items-center">
                          <Label htmlFor="viewGender" className="sm:col-span-1 flex items-center text-gray-600 text-sm sm:text-right sm:justify-end">
                            Gender<span className="text-red-500 ml-1">*</span>
                          </Label>
                          <div className="sm:col-span-3">
                            <Select
                              value={viewFormData.gender}
                              onValueChange={(value) => setViewFormData(prev => ({ ...prev, gender: value }))}
                            >
                              <SelectTrigger className="border-[#0A5C36]/20 focus:ring-[#0A5C36]/20 w-full" tabIndex={3}>
                                <SelectValue placeholder="Select gender" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="male">Male</SelectItem>
                                <SelectItem value="female">Female</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <h4 className="text-[#0A5C36] font-medium text-lg">Contact Information</h4>
                      
                      <div className="space-y-4 sm:space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-3 items-start sm:items-center">
                          <Label htmlFor="viewPhone" className="sm:col-span-1 flex items-center text-gray-600 text-sm sm:text-right sm:justify-end">
                            Phone
                          </Label>
                          <div className="sm:col-span-3">
                            <Input
                              id="viewPhone"
                              type="tel"
                              className="border-[#0A5C36]/20 focus:ring-[#0A5C36]/20 focus:border-[#0A5C36] w-full"
                              value={viewFormData.phone || ''}
                              onChange={(e) => setViewFormData(prev => ({ ...prev, phone: e.target.value }))}
                              placeholder="Enter phone number"
                              tabIndex={4}
                            />
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-3 items-start sm:items-center">
                          <Label htmlFor="viewEmail" className="sm:col-span-1 flex items-center text-gray-600 text-sm sm:text-right sm:justify-end">
                            Email
                          </Label>
                          <div className="sm:col-span-3">
                            <Input
                              id="viewEmail"
                              type="email"
                              className="border-[#0A5C36]/20 focus:ring-[#0A5C36]/20 focus:border-[#0A5C36] w-full"
                              value={viewFormData.email || ''}
                              onChange={(e) => setViewFormData(prev => ({ ...prev, email: e.target.value }))}
                              placeholder="Enter email address"
                              tabIndex={5}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  /* View mode layout */
                  <div className="bg-[#F9FAFB] rounded-lg border border-gray-100 shadow-sm">
                    <div className="divide-y divide-gray-100">
                      {/* Gender field */}
                      <div className="p-4 flex justify-between items-center">
                        <div className="font-medium text-gray-500">Gender</div>
                        <div className="font-medium">
                          {viewFormData.gender === 'male' ? 'Male' : 
                           viewFormData.gender === 'female' ? 'Female' : 'Other'}
                        </div>
                      </div>
                      
                      {/* Phone field with icon */}
                      <div className="p-4 flex justify-between items-center">
                        <div className="font-medium text-gray-500 flex items-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[#0A5C36]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          Phone
                        </div>
                        {viewFormData.phone ? (
                          <div className="font-medium">{viewFormData.phone}</div>
                        ) : (
                          <div className="text-gray-400 italic">Not available</div>
                        )}
                      </div>
                      
                      {/* Email field with icon */}
                      <div className="p-4 flex justify-between items-center">
                        <div className="font-medium text-gray-500 flex items-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[#0A5C36]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          Email
                        </div>
                        {viewFormData.email ? (
                          <div className="font-medium">{viewFormData.email}</div>
                        ) : (
                          <div className="text-gray-400 italic">Not available</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <SheetFooter className="border-t pt-4 mt-2 sticky bottom-0 bg-white z-10 pb-6">
              <div className="flex gap-3 w-full">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsViewSheetOpen(false);
                    setIsEditMode(false);
                  }}
                  disabled={saving}
                  className="flex-1 border-gray-200 hover:bg-gray-50"
                >
                  Close
                </Button>
                {isEditMode ? (
                  <Button 
                    onClick={handleUpdateMember} 
                    disabled={saving} 
                    className="flex-1 bg-[#0A5C36] hover:bg-[#0A5C36]/90 text-white transition-colors"
                  >
                    {saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
                    Save Changes
                  </Button>
                ) : (
                  <Button
                    onClick={() => setIsEditMode(true)}
                    disabled={!(currentUser?.uid === (selectedNode as CustomNode)?.attributes?.treeOwnerId || firestoreUser?.isAdmin)}
                    className="flex-1 bg-white border border-[#0A5C36] text-[#0A5C36] hover:bg-[#0A5C36]/5 transition-colors"
                  >
                    Edit Details
                  </Button>
                )}
              </div>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {/* Family Management Sheet */}
        <Sheet open={isFamilyManagementOpen} onOpenChange={setIsFamilyManagementOpen}>
          <SheetContent className="sm:max-w-[700px] overflow-y-auto p-0">
            <SheetHeader className="p-6 border-b sticky top-0 bg-white z-10">
              <SheetTitle>Family Tree Management</SheetTitle>
            </SheetHeader>
            
            <div className="px-6 py-4">
              <h3 className="text-lg font-medium mb-4">Tree Members</h3>
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {familyMembers.map((member) => {
                      const isCurrentUser = member.id === currentUser?.uid;
                      const dateAdded = member.createdAt ? 
                        (member.createdAt instanceof Date ? 
                          member.createdAt.toLocaleDateString() : 
                          (typeof member.createdAt === 'object' && 'seconds' in member.createdAt ? 
                            new Date((member.createdAt as FirestoreTimestamp).seconds * 1000).toLocaleDateString() : 
                            new Date(member.createdAt as string | number).toLocaleDateString())) : 
                        'Unknown';
                        
                      return (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={member.profilePicture || undefined} alt={member.displayName} />
                              <AvatarFallback className="bg-[#0A5C36] text-white text-xs">
                                {member.displayName.split(' ').map(n => n[0]).join('')}
                              </AvatarFallback>
                            </Avatar>
                            <div className="font-medium">{member.displayName}</div>
                            {isCurrentUser && <span className="text-xs text-muted-foreground">(You)</span>}
                            {member.isOwner && <span className="text-xs text-primary ml-1">(Owner)</span>}
                          </TableCell>
                          <TableCell>{dateAdded}</TableCell>
                          <TableCell>
                            {member.isOwner ? 'Owner' : (member.isAdmin ? 'Admin' : 'Member')}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <span className="sr-only">Open menu</span>
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => {
                                  setMemberEditTarget(member.id);
                                  handleViewMember();
                                }}>
                                  Edit Member Info
                                </DropdownMenuItem>
                                
                                {!member.isOwner && !isCurrentUser && (
                                  member.isAdmin ? (
                                    <DropdownMenuItem onClick={() => handleDemoteToMember(member.id)}>
                                      Demote to Member
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem onClick={() => handlePromoteToAdmin(member.id)}>
                                      Promote to Admin
                                    </DropdownMenuItem>
                                  )
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
            
            <SheetFooter className="p-6 border-t sticky bottom-0 bg-white z-10 pb-8">
              <Button
                variant="outline"
                onClick={() => setIsFamilyManagementOpen(false)}
              >
                Close
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {treeData.length === 0 ? (
          <div className="flex flex-col items-center justify-center w-full h-full gap-4 p-8">
            <h2 className="text-xl font-semibold">
              {isOnboardingLoading 
                ? "Setting up your profile..." 
                : hasCompletedOnboarding 
                  ? "No Family Tree Data" 
                  : "Profile Setup Required"
              }
            </h2>
            <p className="text-gray-600 text-center max-w-md">
              {isOnboardingLoading 
                ? "We're checking your profile status. This will only take a moment..."
                : hasCompletedOnboarding 
                  ? "Your family tree appears to be empty. This might be a temporary loading issue."
                  : "Please complete your profile to access your family tree and start building your family connections."
              }
            </p>
            
            {isOnboardingLoading && (
              <div className="flex items-center gap-2 mt-4">
                <Spinner className="h-5 w-5" />
                <span className="text-sm text-gray-500">Loading profile...</span>
              </div>
            )}
            
            {hasCompletedOnboarding && !isOnboardingLoading && (
              <div className="flex flex-col items-center gap-4 mt-4">
                <Button
                  onClick={() => {
                    setLoading(true);
                    fetchFamilyTreeData();
                  }}
                  disabled={loading}
                  className="bg-[#0A5C36] hover:bg-[#0A5C36]/90"
                >
                  {loading ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      Loading...
                    </>
                  ) : (
                    "Try Again"
                  )}
                </Button>
                
                <div className="text-xs text-gray-500 text-center max-w-lg">
                  <p>If this issue persists:</p>
                  <p>1. Check the browser console for error messages</p>
                  <p>2. Try refreshing the page</p>
                  <p>3. Clear your browser cache and try again</p>
                </div>
                
                {/* Debug info - only show in development */}
                {process.env.NODE_ENV === 'development' && (
                  <div className="text-xs text-gray-400 mt-4 p-4 bg-gray-50 rounded">
                    <p><strong>Debug Info:</strong></p>
                    <p>User ID: {currentUser?.uid}</p>
                    <p>Onboarding Completed: {hasCompletedOnboarding.toString()}</p>
                    <p>Onboarding Loading: {isOnboardingLoading.toString()}</p>
                    <p>Tree Data Length: {treeData.length}</p>
                    <p>Loading: {loading.toString()}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div 
            ref={treeContainerRef}
            className="absolute inset-0 overflow-hidden select-none"
            style={{ 
              cursor: isMobileRef.current ? 'default' : (isDragging ? 'grabbing' : 'grab'),
              userSelect: 'none',
              WebkitUserSelect: 'none',
              MozUserSelect: 'none',
              msUserSelect: 'none'
            }}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div 
              className="tree-wrapper absolute"
              style={{
                width: treeLayout.canvas.width * WIDTH,
                height: treeLayout.canvas.height * HEIGHT,
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transition: 'transform 0.2s ease-out',
                transformOrigin: '0 0',
                left: 0,
                top: 0
              }}
            >
              {/* Render connectors first so they appear behind nodes */}
              {treeLayout.connectors.length > 0 && (
                <svg
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: treeLayout.canvas.width * WIDTH,
                    height: treeLayout.canvas.height * HEIGHT,
                    overflow: 'visible',
                    pointerEvents: 'none',
                  }}
                >
                  {treeLayout.connectors.map((connector: Connector, index: number) => {
                    const [x1, y1, x2, y2] = connector;

                    // Calculate centered coordinates
                    const startX = x1 * WIDTH - (WIDTH / 2);
                    const startY = y1 * HEIGHT - (HEIGHT / 2.5);
                    const endX = x2 * WIDTH - (WIDTH / 2);
                    const endY = y2 * HEIGHT - (HEIGHT / 2.5);

                    return (
                      <path
                        key={`connector-${index}`}
                        d={`M ${startX} ${startY} L ${endX} ${endY}`}
                        stroke="#94a3b8"
                        strokeWidth="1"
                        fill="none"
                      />
                    );
                  })}
                </svg>
              )}

              {/* Render nodes on top of connectors */}
              {visibleNodes.map((node: ExtNode) => (
                <div
                  key={node.id}
                  onMouseDown={(e) => {
                    // Don't handle node click if we're on mobile (touch will handle it)
                    if (!isMobileRef.current) {
                      e.stopPropagation();
                    }
                  }}
                  onMouseUp={(e) => {
                    // Only handle click if we're not dragging
                    if (!isMobileRef.current && !isDraggingRef.current) {
                      handleNodeClick(node, true);
                    }
                    e.stopPropagation();
                  }}
                  className="cursor-pointer absolute"
                  style={{
                    left: node.left * WIDTH,
                    top: node.top * HEIGHT,
                    width: WIDTH,
                    height: HEIGHT,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <FamilyNode
                    node={node}
                    isSelected={selectedNode?.id === node.id}
                    style={{
                      width: WIDTH - 20,
                      height: HEIGHT - 40,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <AlertDialog 
          open={showDeleteDialog} 
          onOpenChange={(open) => {
            setShowDeleteDialog(open);
            if (!open) setDeleteError(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure you want to remove this family member?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently remove this member from your family tree.
                {deleteError && (
                  <p className="mt-2 text-red-600">{deleteError}</p>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteMember}
                disabled={saving || !!deleteError}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {saving ? "Removing..." : "Remove Member"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </ProtectedRoute>
  );
} 