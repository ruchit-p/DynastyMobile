'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { addFamilyMember } from '@/utils/functionUtils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  CalendarIcon,
  UserPlus,
  Users,
  Heart,
  Baby,
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

interface AddMemberForm {
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth?: Date;
  gender: 'male' | 'female' | 'other' | '';
  relationshipType: 'parent' | 'child' | 'spouse' | 'sibling' | '';
  relationshipTo: string;
  phoneNumber: string;
  sendInvite: boolean;
}

export default function AddFamilyMemberPage() {
  const { firestoreUser } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<AddMemberForm>({
    firstName: '',
    lastName: '',
    email: '',
    gender: '',
    relationshipType: '',
    relationshipTo: firestoreUser?.id || '',
    phoneNumber: '',
    sendInvite: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.firstName || !form.lastName) {
      toast({
        title: 'Missing information',
        description: 'Please provide first and last name',
        variant: 'destructive',
      });
      return;
    }

    if (form.sendInvite && !form.email) {
      toast({
        title: 'Email required',
        description: 'Email is required to send an invitation',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const result = await addFamilyMember({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        dateOfBirth: form.dateOfBirth?.toISOString(),
        gender: form.gender || undefined,
        phoneNumber: form.phoneNumber || undefined,
        relationshipType: form.relationshipType,
        relationshipTo: form.relationshipTo,
        sendInvite: form.sendInvite,
      });

      const { memberId } = result as { memberId: string };

      toast({
        title: 'Member added',
        description: form.sendInvite
          ? `${form.firstName} has been added and invited to join`
          : `${form.firstName} has been added to the family tree`,
      });

      router.push(`/member-profile/${memberId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Please try again';
      toast({
        title: 'Failed to add member',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="container mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/family-management')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Add Family Member</h1>
          <p className="text-sm text-gray-600">
            Add a new member to your family tree
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Basic Information</h2>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={(e) =>
                    setForm({ ...form, firstName: e.target.value })
                  }
                  placeholder="John"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) =>
                    setForm({ ...form, lastName: e.target.value })
                  }
                  placeholder="Doe"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="john.doe@example.com"
              />
              <p className="text-xs text-gray-500">
                Required if sending an invitation
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                type="tel"
                value={form.phoneNumber}
                onChange={(e) =>
                  setForm({ ...form, phoneNumber: e.target.value })
                }
                placeholder="+1 (555) 123-4567"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date of Birth</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !form.dateOfBirth && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.dateOfBirth
                        ? format(form.dateOfBirth, 'PPP')
                        : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.dateOfBirth}
                      onSelect={(date) =>
                        setForm({ ...form, dateOfBirth: date })
                      }
                      disabled={(date) =>
                        date > new Date() || date < new Date('1900-01-01')
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Gender</Label>
                <Select
                  value={form.gender}
                  onValueChange={(value) =>
                    setForm({ ...form, gender: value as 'male' | 'female' | 'other' | '' })
                  }
                >
                  <SelectTrigger>
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
        </Card>

        {/* Relationship */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Relationship</h2>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>How is this person related to you?</Label>
              <RadioGroup
                value={form.relationshipType}
                onValueChange={(value) =>
                  setForm({ ...form, relationshipType: value as 'parent' | 'child' | 'spouse' | 'sibling' | '' })
                }
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="parent" id="parent" />
                  <Label htmlFor="parent" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Parent
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="child" id="child" />
                  <Label htmlFor="child" className="flex items-center gap-2">
                    <Baby className="h-4 w-4" />
                    Child
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="spouse" id="spouse" />
                  <Label htmlFor="spouse" className="flex items-center gap-2">
                    <Heart className="h-4 w-4" />
                    Spouse
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sibling" id="sibling" />
                  <Label htmlFor="sibling" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Sibling
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        </Card>

        {/* Invitation */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Invitation</h2>
          
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="sendInvite"
                checked={form.sendInvite}
                onChange={(e) =>
                  setForm({ ...form, sendInvite: e.target.checked })
                }
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="sendInvite">
                Send an invitation to join Dynasty
              </Label>
            </div>
            
            {form.sendInvite && (
              <p className="text-sm text-gray-600">
                An email invitation will be sent to {form.email || 'their email'} with
                instructions to join your family tree.
              </p>
            )}
          </div>
        </Card>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/family-management')}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Adding...
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Member
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}