'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { UserAvatar } from '@/components/ui/user-avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Users, MessageSquare, Search } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';

interface FamilyMember {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  profilePicture?: string;
  relationship?: string;
}

export default function NewChatPage() {
  const { currentUser, firestoreUser } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchFamilyMembers();
  }, [firestoreUser?.familyTreeId, fetchFamilyMembers]);

  const fetchFamilyMembers = useCallback(async () => {
    if (!firestoreUser?.familyTreeId) return;

    try {
      const getFamilyMembers = httpsCallable(functions, 'getFamilyTreeMembers');
      const result = await getFamilyMembers({ 
        familyTreeId: firestoreUser.familyTreeId 
      });
      
      const members = (result.data as { members: FamilyMember[] }).members || [];
      // Filter out current user
      const filteredMembers = members.filter(m => m.id !== currentUser?.uid);
      setFamilyMembers(filteredMembers);
    } catch (error) {
      console.error('Error fetching family members:', error);
      toast({
        title: 'Error',
        description: 'Failed to load family members',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [firestoreUser?.familyTreeId, currentUser?.uid, toast]);

  const handleCreateChat = async () => {
    if (selectedMembers.length === 0) {
      toast({
        title: 'Select members',
        description: 'Please select at least one member to start a conversation',
        variant: 'destructive'
      });
      return;
    }

    if (selectedMembers.length > 1 && !groupName.trim()) {
      toast({
        title: 'Group name required',
        description: 'Please enter a name for the group chat',
        variant: 'destructive'
      });
      return;
    }

    setCreating(true);

    try {
      const createChat = httpsCallable(functions, 'createChat');
      const result = await createChat({
        participantIds: [...selectedMembers, currentUser?.uid],
        name: selectedMembers.length > 1 ? groupName : undefined,
        type: selectedMembers.length > 1 ? 'group' : 'direct',
        isEncrypted: true
      });

      const chatId = (result.data as { chatId: string }).chatId;
      router.push(`/chat/${chatId}`);
    } catch (error) {
      console.error('Error creating chat:', error);
      toast({
        title: 'Error',
        description: 'Failed to create conversation',
        variant: 'destructive'
      });
    } finally {
      setCreating(false);
    }
  };

  const toggleMember = (memberId: string) => {
    setSelectedMembers(prev => 
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  const filteredMembers = familyMembers.filter(member =>
    member.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    member.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    member.lastName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">New Conversation</h1>
          <p className="text-sm text-gray-600">
            Select family members to start chatting
          </p>
        </div>
      </div>

      {/* Group Name Input (shown when multiple members selected) */}
      {selectedMembers.length > 1 && (
        <Card className="mb-6 p-4">
          <Label htmlFor="groupName" className="mb-2 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Group Name
          </Label>
          <input
            id="groupName"
            type="text"
            placeholder="Enter group name..."
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-500 focus:outline-none"
          />
        </Card>
      )}

      {/* Search Bar */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search family members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Member List */}
      {filteredMembers.length === 0 ? (
        <Card className="p-8 text-center">
          <Users className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <h3 className="mb-2 text-lg font-semibold">No family members found</h3>
          <p className="text-sm text-gray-600">
            Add family members to start conversations
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredMembers.map((member) => (
            <Card
              key={member.id}
              className={`cursor-pointer p-4 transition-colors ${
                selectedMembers.includes(member.id)
                  ? 'border-blue-500 bg-blue-50'
                  : 'hover:bg-gray-50'
              }`}
              onClick={() => toggleMember(member.id)}
            >
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedMembers.includes(member.id)}
                  onCheckedChange={() => toggleMember(member.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <UserAvatar
                  src={member.profilePicture || '/avatar.svg'}
                  alt={member.displayName}
                  size="md"
                />
                <div className="flex-1">
                  <h3 className="font-semibold">{member.displayName}</h3>
                  {member.relationship && (
                    <p className="text-sm text-gray-600">{member.relationship}</p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-white p-4">
        <div className="container mx-auto flex max-w-2xl gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={handleCreateChat}
            disabled={selectedMembers.length === 0 || creating}
          >
            {creating ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Creating...
              </>
            ) : (
              <>
                <MessageSquare className="mr-2 h-4 w-4" />
                Start Conversation
                {selectedMembers.length > 0 && ` (${selectedMembers.length})`}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}