'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Phone,
  Mail,
  Users,
  Crown,
  UserPlus,
  Camera,
  FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from '@/components/ui/user-avatar';

interface MemberProfile {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  dateOfBirth?: Date;
  gender?: string;
  profilePicture?: string;
  bio?: string;
  location?: string;
  role: 'admin' | 'member';
  canAddMembers: boolean;
  canEdit: boolean;
  joinedAt: Date;
  relationship?: string;
  parentIds: string[];
  childrenIds: string[];
  spouseIds: string[];
  stats: {
    storiesCount: number;
    eventsCount: number;
    photosCount: number;
  };
}

interface RelationshipInfo {
  id: string;
  displayName: string;
  profilePicture?: string;
  relationship: string;
}

export default function MemberProfilePage() {
  const params = useParams();
  const memberId = params.id as string;
  const { currentUser, firestoreUser } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [relationships, setRelationships] = useState<RelationshipInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('profile');

  const isOwnProfile = memberId === currentUser?.uid;
  const canEdit = isOwnProfile || firestoreUser?.isAdmin || firestoreUser?.canEdit;

  const loadMemberProfile = useCallback(async () => {
    setLoading(true);
    try {
      const getMemberProfile = httpsCallable(functions, 'getMemberProfile');
      const result = await getMemberProfile({ userId: memberId });
      const data = result.data as {
        profile: MemberProfile;
        relationships: RelationshipInfo[];
      };
      
      setProfile(data.profile);
      setRelationships(data.relationships || []);
    } catch (error) {
      console.error('Error loading member profile:', error);
      toast({
        title: 'Error',
        description: 'Failed to load member profile',
        variant: 'destructive',
      });
      router.push('/family-tree');
    } finally {
      setLoading(false);
    }
  }, [memberId, toast, router]);

  useEffect(() => {
    loadMemberProfile();
  }, [loadMemberProfile]);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/family-tree')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Member Profile</h1>
      </div>

      {/* Profile Header */}
      <Card className="mb-6 p-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <UserAvatar
            src={profile.profilePicture || '/avatar.svg'}
            alt={profile.displayName}
            size="xl"
            className="h-24 w-24"
          />
          
          <div className="flex-1 text-center sm:text-left">
            <div className="mb-2 flex flex-col items-center gap-2 sm:flex-row">
              <h2 className="text-2xl font-bold">{profile.displayName}</h2>
              <div className="flex gap-2">
                {profile.role === 'admin' && (
                  <Badge variant="secondary">
                    <Crown className="mr-1 h-3 w-3" />
                    Admin
                  </Badge>
                )}
                {profile.canAddMembers && (
                  <Badge variant="outline">
                    <UserPlus className="mr-1 h-3 w-3" />
                    Can Invite
                  </Badge>
                )}
              </div>
            </div>
            
            {profile.bio && (
              <p className="mb-4 text-gray-600">{profile.bio}</p>
            )}
            
            <div className="mb-4 flex flex-wrap gap-4 text-sm text-gray-600">
              {profile.email && (
                <div className="flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {profile.email}
                </div>
              )}
              {profile.phoneNumber && (
                <div className="flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  {profile.phoneNumber}
                </div>
              )}
              {profile.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {profile.location}
                </div>
              )}
              {profile.dateOfBirth && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {format(profile.dateOfBirth, 'MMMM d, yyyy')}
                </div>
              )}
            </div>
            
            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <Button
                  variant="outline"
                  onClick={() => router.push(`/edit-profile${isOwnProfile ? '' : `/${memberId}`}`)}
                >
                  Edit Profile
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Content Stats */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Card className="p-4 text-center">
          <FileText className="mx-auto mb-2 h-8 w-8 text-blue-500" />
          <div className="text-2xl font-bold">{profile.stats.storiesCount}</div>
          <div className="text-sm text-gray-600">Stories</div>
        </Card>
        <Card className="p-4 text-center">
          <Calendar className="mx-auto mb-2 h-8 w-8 text-green-500" />
          <div className="text-2xl font-bold">{profile.stats.eventsCount}</div>
          <div className="text-sm text-gray-600">Events</div>
        </Card>
        <Card className="p-4 text-center">
          <Camera className="mx-auto mb-2 h-8 w-8 text-purple-500" />
          <div className="text-2xl font-bold">{profile.stats.photosCount}</div>
          <div className="text-sm text-gray-600">Photos</div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="relationships">
            Relationships ({relationships.length})
          </TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card className="p-6">
            <h3 className="mb-4 text-lg font-semibold">Personal Information</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Full Name</span>
                <span className="font-medium">
                  {profile.firstName} {profile.lastName}
                </span>
              </div>
              {profile.gender && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Gender</span>
                  <span className="font-medium capitalize">{profile.gender}</span>
                </div>
              )}
              {profile.relationship && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Relationship</span>
                  <span className="font-medium">{profile.relationship}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Member Since</span>
                <span className="font-medium">
                  {format(profile.joinedAt, 'MMMM yyyy')}
                </span>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Relationships Tab */}
        <TabsContent value="relationships">
          {relationships.length === 0 ? (
            <Card className="p-8 text-center">
              <Users className="mx-auto mb-4 h-12 w-12 text-gray-400" />
              <h3 className="mb-2 text-lg font-semibold">No relationships added</h3>
              <p className="text-sm text-gray-600">
                Family relationships will appear here
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {relationships.map((relation) => (
                <Card
                  key={relation.id}
                  className="cursor-pointer p-4 transition-colors hover:bg-gray-50"
                  onClick={() => router.push(`/member-profile/${relation.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      src={relation.profilePicture || '/avatar.svg'}
                      alt={relation.displayName}
                      size="md"
                    />
                    <div>
                      <h4 className="font-medium">{relation.displayName}</h4>
                      <p className="text-sm text-gray-600">
                        {relation.relationship}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity">
          <Card className="p-8 text-center">
            <Calendar className="mx-auto mb-4 h-12 w-12 text-gray-400" />
            <h3 className="mb-2 text-lg font-semibold">Activity coming soon</h3>
            <p className="text-sm text-gray-600">
              Recent stories, events, and updates will appear here
            </p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}