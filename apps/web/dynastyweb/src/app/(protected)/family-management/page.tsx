'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { 
  getFamilyTreeMembers, 
  getPendingInvitations, 
  sendFamilyInvitation, 
  removeFamilyMember, 
  updateFamilyMemberRole, 
  cancelFamilyInvitation 
} from '@/utils/functionUtils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Users,
  UserPlus,
  Mail,
  Crown,
  UserX,
  Search,
  MoreVertical,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from '@/components/ui/user-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface FamilyMember {
  id: string;
  displayName: string;
  email: string;
  profilePicture?: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  status: 'active' | 'invited' | 'inactive';
  canAddMembers?: boolean;
  canEdit?: boolean;
  relationship?: string;
}

interface PendingInvitation {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  invitedBy: string;
  invitedAt: string;
  status: 'pending' | 'accepted' | 'expired';
  inviteeEmail?: string;
  inviteeName?: string;
  invitedByName?: string;
  createdAt?: Date;
  expiresAt?: Date;
}

export default function FamilyManagementPage() {
  const { currentUser, firestoreUser } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('members');
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [selectedMember, setSelectedMember] = useState<FamilyMember | null>(null);
  const [processing, setProcessing] = useState(false);

  const [inviteForm, setInviteForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    relationship: '',
  });

  const loadFamilyData = useCallback(async () => {
    if (!firestoreUser?.familyTreeId) return;

    setLoading(true);
    try {
      // Load family members
      const membersResult = await getFamilyTreeMembers({
        familyTreeId: firestoreUser.familyTreeId,
      });
      setMembers(membersResult.members || []);

      // Load pending invitations
      const invitationsResult = await getPendingInvitations({
        familyTreeId: firestoreUser.familyTreeId,
      });
      setInvitations(invitationsResult.invitations || []);
    } catch (error) {
      console.error('Error loading family data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load family information',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [firestoreUser?.familyTreeId, toast]);

  useEffect(() => {
    loadFamilyData();
  }, [loadFamilyData]);

  const handleInviteMember = async () => {
    if (!inviteForm.email || !inviteForm.firstName || !inviteForm.lastName) {
      toast({
        title: 'Missing information',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    setProcessing(true);
    try {
      await sendFamilyInvitation({
        email: inviteForm.email,
        firstName: inviteForm.firstName,
        lastName: inviteForm.lastName,
        relationship: inviteForm.relationship,
      });

      toast({
        title: 'Invitation sent',
        description: `Invitation sent to ${inviteForm.email}`,
      });

      setShowInviteDialog(false);
      setInviteForm({ email: '', firstName: '', lastName: '', relationship: '' });
      await loadFamilyData();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Please try again';
      toast({
        title: 'Failed to send invitation',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!selectedMember) return;

    setProcessing(true);
    try {
      await removeFamilyMember({
        memberId: selectedMember.id,
        familyTreeId: firestoreUser?.familyTreeId || '',
      });

      toast({
        title: 'Member removed',
        description: `${selectedMember.displayName} has been removed from the family`,
      });

      setShowRemoveDialog(false);
      setSelectedMember(null);
      await loadFamilyData();
    } catch (error) {
      console.error('Error removing member:', error);
      toast({
        title: 'Failed to remove member',
        description: 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleUpdateMemberRole = async (member: FamilyMember, role: 'admin' | 'member') => {
    try {
      await updateFamilyMemberRole({
        memberId: member.id,
        role,
        familyTreeId: firestoreUser?.familyTreeId || '',
      });

      toast({
        title: 'Role updated',
        description: `${member.displayName} is now ${role === 'admin' ? 'an admin' : 'a member'}`,
      });

      await loadFamilyData();
    } catch (error) {
      console.error('Error updating role:', error);
      toast({
        title: 'Failed to update role',
        description: 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      await cancelFamilyInvitation({ invitationId });

      toast({
        title: 'Invitation cancelled',
        description: 'The invitation has been cancelled',
      });

      await loadFamilyData();
    } catch (error) {
      console.error('Error cancelling invitation:', error);
      toast({
        title: 'Failed to cancel invitation',
        description: 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const filteredMembers = members.filter(
    (member) =>
      member.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredInvitations = invitations.filter(
    (invitation) =>
      invitation.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      invitation.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      invitation.lastName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const canManageFamily = firestoreUser?.isAdmin || firestoreUser?.canAddMembers;

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Family Management</h1>
          <p className="text-sm text-gray-600">
            Manage your family members and invitations
          </p>
        </div>
        {canManageFamily && (
          <Button onClick={() => setShowInviteDialog(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Invite Member
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="text"
            placeholder="Search members or invitations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="members">
            Members ({members.length})
          </TabsTrigger>
          <TabsTrigger value="invitations">
            Invitations ({invitations.length})
          </TabsTrigger>
        </TabsList>

        {/* Members Tab */}
        <TabsContent value="members">
          {filteredMembers.length === 0 ? (
            <Card className="p-8 text-center">
              <Users className="mx-auto mb-4 h-12 w-12 text-gray-400" />
              <h3 className="mb-2 text-lg font-semibold">No members found</h3>
              <p className="text-sm text-gray-600">
                {searchQuery
                  ? 'Try adjusting your search'
                  : 'Start by inviting family members'}
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredMembers.map((member) => (
                <Card key={member.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <UserAvatar
                        src={member.profilePicture || '/avatar.svg'}
                        alt={member.displayName}
                        size="md"
                      />
                      <div>
                        <h3 className="font-semibold">{member.displayName}</h3>
                        <p className="text-sm text-gray-600">{member.email}</p>
                        {member.relationship && (
                          <p className="text-sm text-gray-500">
                            {member.relationship}
                          </p>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                          {member.role === 'admin' && (
                            <Badge variant="secondary">
                              <Crown className="mr-1 h-3 w-3" />
                              Admin
                            </Badge>
                          )}
                          {member.canAddMembers && (
                            <Badge variant="outline">
                              <UserPlus className="mr-1 h-3 w-3" />
                              Can Invite
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    {canManageFamily && member.id !== currentUser?.uid && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => router.push(`/member-profile/${member.id}`)}
                          >
                            View Profile
                          </DropdownMenuItem>
                          {firestoreUser?.isAdmin && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  handleUpdateMemberRole(
                                    member,
                                    member.role === 'admin' ? 'member' : 'admin'
                                  )
                                }
                              >
                                {member.role === 'admin'
                                  ? 'Remove Admin'
                                  : 'Make Admin'}
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedMember(member);
                              setShowRemoveDialog(true);
                            }}
                            className="text-red-600"
                          >
                            <UserX className="mr-2 h-4 w-4" />
                            Remove from Family
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  <div className="mt-3 text-xs text-gray-500">
                    Joined {format(member.joinedAt, 'MMM d, yyyy')}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Invitations Tab */}
        <TabsContent value="invitations">
          {filteredInvitations.length === 0 ? (
            <Card className="p-8 text-center">
              <Mail className="mx-auto mb-4 h-12 w-12 text-gray-400" />
              <h3 className="mb-2 text-lg font-semibold">No pending invitations</h3>
              <p className="text-sm text-gray-600">
                All invitations have been accepted or expired
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredInvitations.map((invitation) => (
                <Card key={invitation.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">
                          {invitation.inviteeName || 'Unnamed'}
                        </h3>
                        <Badge
                          variant={
                            invitation.status === 'pending'
                              ? 'secondary'
                              : invitation.status === 'accepted'
                              ? 'default'
                              : 'destructive'
                          }
                        >
                          {invitation.status === 'pending' && (
                            <Clock className="mr-1 h-3 w-3" />
                          )}
                          {invitation.status === 'accepted' && (
                            <CheckCircle className="mr-1 h-3 w-3" />
                          )}
                          {invitation.status === 'expired' && (
                            <XCircle className="mr-1 h-3 w-3" />
                          )}
                          {invitation.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600">
                        {invitation.email}
                      </p>
                      <div className="mt-2 text-xs text-gray-500">
                        {invitation.firstName} {invitation.lastName} •{' '}
                        {format(new Date(invitation.invitedAt), 'MMM d, yyyy')}
                      </div>
                    </div>
                    {invitation.status === 'pending' && canManageFamily && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCancelInvitation(invitation.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Invite Member Dialog */}
      <AlertDialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Invite Family Member</AlertDialogTitle>
            <AlertDialogDescription>
              Send an invitation to join your family tree
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email Address *
              </label>
              <Input
                id="email"
                type="email"
                placeholder="member@example.com"
                value={inviteForm.email}
                onChange={(e) =>
                  setInviteForm({ ...inviteForm, email: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="firstName" className="text-sm font-medium">
                  First Name *
                </label>
                <Input
                  id="firstName"
                  placeholder="John"
                  value={inviteForm.firstName}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, firstName: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="lastName" className="text-sm font-medium">
                  Last Name *
                </label>
                <Input
                  id="lastName"
                  placeholder="Doe"
                  value={inviteForm.lastName}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, lastName: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="relationship" className="text-sm font-medium">
                Relationship (Optional)
              </label>
              <Input
                id="relationship"
                placeholder="e.g., Brother, Cousin, etc."
                value={inviteForm.relationship}
                onChange={(e) =>
                  setInviteForm({ ...inviteForm, relationship: e.target.value })
                }
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleInviteMember}
              disabled={processing}
            >
              {processing ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Sending...
                </>
              ) : (
                'Send Invitation'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Member Dialog */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Family Member?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {selectedMember?.displayName} from the family?
              They will lose access to family content and need to be reinvited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              disabled={processing}
              className="bg-red-600 hover:bg-red-700"
            >
              {processing ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Removing...
                </>
              ) : (
                'Remove Member'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}