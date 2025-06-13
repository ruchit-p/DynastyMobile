import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { collection, doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/ui/spinner'

interface FamilyMember {
  id: string;
  displayName: string;
}

interface FamilyMemberSelectProps {
  selectedMembers: string[]
  onMemberSelect: (members: string[]) => void
  placeholder?: string
  className?: string
}

export function FamilyMemberSelect({
  selectedMembers,
  onMemberSelect,
  placeholder = "Select family members",
  className
}: FamilyMemberSelectProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const { currentUser } = useAuth()

  // Memoize the function that checks and removes current user from selection
  const removeCurrentUserFromSelection = useCallback((userId: string, members: string[]) => {
    if (members.includes(userId)) {
      onMemberSelect(members.filter(id => id !== userId));
    }
  }, [onMemberSelect]);

  // Memoize the fetch function to prevent recreation on every render
  const fetchFamilyMembers = useCallback(async () => {
    if (!currentUser) return;

    try {
      setLoading(true);
      // First get the user's family tree ID
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (!userDoc.exists()) {
        console.error('User document not found');
        return;
      }

      const userData = userDoc.data();
      const familyTreeId = userData.familyTreeId;

      // Get the family tree document
      const treeDoc = await getDoc(doc(db, 'familyTrees', familyTreeId));
      if (!treeDoc.exists()) {
        console.error('Family tree not found');
        return;
      }

      // Fetch all users in the family tree
      const usersRef = collection(db, 'users');
      const userDocs = await Promise.all(
        treeDoc.data().memberUserIds.map((userId: string) => 
          getDoc(doc(usersRef, userId))
        )
      );

      // Transform user data into FamilyMember format
      const members = userDocs
        .filter(doc => doc.exists())
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            displayName: data.displayName || `${data.firstName} ${data.lastName}`.trim()
          };
        })
        // Filter out the current user
        .filter(member => member.id !== currentUser.uid);

      setFamilyMembers(members);
      
      // Also remove the current user from selectedMembers if they're included
      removeCurrentUserFromSelection(currentUser.uid, selectedMembers);
    } catch (error) {
      console.error('Error fetching family members:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUser, removeCurrentUserFromSelection, selectedMembers]);

  useEffect(() => {
    void fetchFamilyMembers();
  }, [fetchFamilyMembers]);

  // Memoize toggleMember to prevent recreation on every render
  const toggleMember = useCallback((value: string) => {
    const newSelection = selectedMembers.includes(value)
      ? selectedMembers.filter(id => id !== value)
      : [...selectedMembers, value];
    onMemberSelect(newSelection);
  }, [selectedMembers, onMemberSelect]);

  // Memoize the selection status text
  const selectionText = useMemo(() => {
    return selectedMembers.length > 0
      ? `${selectedMembers.length} member${selectedMembers.length === 1 ? '' : 's'} selected`
      : placeholder;
  }, [selectedMembers, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          {selectionText}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Search family members..." />
          <CommandList>
            <CommandEmpty>No family member found.</CommandEmpty>
            <CommandGroup>
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Spinner className="h-4 w-4" />
                </div>
              ) : (
                familyMembers.map((member) => (
                  <CommandItem
                    key={member.id}
                    value={member.id}
                    onSelect={() => toggleMember(member.id)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedMembers.includes(member.id) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {member.displayName}
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
} 