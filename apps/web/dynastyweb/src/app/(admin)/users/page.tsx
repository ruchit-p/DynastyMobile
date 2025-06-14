'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, MoreVertical, Shield, Mail, Phone } from 'lucide-react';
import { sanitizeUserInput, sanitizeEmail, sanitizePhoneNumber } from '@/utils/inputSanitization';
import { format } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { adminSecurity } from '@/utils/adminSecurity';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import type { UserAdminView } from '@/types/admin';

export default function UsersManagementPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserAdminView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const USERS_PER_PAGE = 20;

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async (searchTerm = '', loadMore = false) => {
    try {
      setIsLoading(true);
      
      const getAdminUsers = httpsCallable(functions, 'getAdminUsers');
      const result = await getAdminUsers({
        searchQuery: searchTerm,
        page,
        limit: USERS_PER_PAGE,
        lastDocId: loadMore && users.length > 0 ? users[users.length - 1].id : null,
      });
      
      const data = result.data as any;
      
      if (data.success) {
        if (loadMore) {
          setUsers([...users, ...data.users]);
        } else {
          setUsers(data.users);
        }
        setHasMore(data.hasMore);
      } else {
        throw new Error('Failed to load users');
      }
    } catch (error) {
      console.error('Failed to load users:', error);
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadUsers(searchQuery);
  };

  const handleMakeAdmin = async (userId: string, isAdmin: boolean) => {
    try {
      const setAdminClaim = httpsCallable(functions, 'setAdminClaim');
      await setAdminClaim({ userId, isAdmin });
      
      await adminSecurity.logAdminAction(
        isAdmin ? 'GRANT_ADMIN' : 'REVOKE_ADMIN',
        { targetUserId: userId }
      );

      toast({
        title: 'Success',
        description: `Admin privileges ${isAdmin ? 'granted' : 'revoked'} successfully`,
      });

      // Reload users
      loadUsers();
    } catch (error) {
      console.error('Failed to update admin status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update admin privileges',
        variant: 'destructive',
      });
    }
  };

  const handleSuspendUser = async (userId: string, suspend: boolean) => {
    try {
      const updateUserStatus = httpsCallable(functions, 'updateUserStatus');
      await updateUserStatus({ 
        userId, 
        suspend,
        reason: suspend ? 'Admin action' : null 
      });
      
      toast({
        title: 'Success',
        description: `User ${suspend ? 'suspended' : 'reactivated'} successfully`,
      });

      loadUsers();
    } catch (error) {
      console.error('Failed to suspend user:', error);
      toast({
        title: 'Error',
        description: 'Failed to update user status',
        variant: 'destructive',
      });
    }
  };

  if (isLoading && users.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">User Management</h1>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">User Management</h1>
        <p className="text-gray-600">Manage user accounts and permissions</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Users</CardTitle>
              <CardDescription>
                Total users: {users.length}
              </CardDescription>
            </div>
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-[300px]"
                />
              </div>
              <Button type="submit">Search</Button>
            </form>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Family</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {sanitizeUserInput(user.displayName || `${user.firstName} ${user.lastName}`)}
                          {user.isAdmin && (
                            <Shield className="h-4 w-4 text-blue-600" />
                          )}
                        </div>
                        <div className="text-sm text-gray-500">{sanitizeEmail(user.email)}</div>
                        {user.phoneNumber && (
                          <div className="text-sm text-gray-500 flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {sanitizePhoneNumber(user.phoneNumber)}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex gap-2">
                          {user.emailVerified && (
                            <Badge variant="outline" className="text-xs">
                              <Mail className="h-3 w-3 mr-1" />
                              Verified
                            </Badge>
                          )}
                          {user.phoneVerified && (
                            <Badge variant="outline" className="text-xs">
                              <Phone className="h-3 w-3 mr-1" />
                              Verified
                            </Badge>
                          )}
                        </div>
                        {user.isSuspended && (
                          <Badge variant="destructive">Suspended</Badge>
                        )}
                        {user.subscriptionStatus && (
                          <Badge
                            variant={user.subscriptionStatus === 'active' ? 'default' : 'secondary'}
                          >
                            {user.subscriptionPlan || user.subscriptionStatus}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {sanitizeUserInput(user.familyTreeName) || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>Stories: {user.storyCount}</div>
                        <div>Events: {user.eventCount}</div>
                        <div>Vault: {user.vaultItemCount}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {format(user.createdAt, 'MMM d, yyyy')}
                      </div>
                      {user.lastLoginAt && (
                        <div className="text-xs text-gray-500">
                          Last: {format(user.lastLoginAt, 'MMM d')}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              // TODO: Implement view details modal
                              toast({
                                title: 'Coming Soon',
                                description: 'User details view is being implemented',
                              });
                            }}
                          >
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleMakeAdmin(user.id, !user.isAdmin)}
                          >
                            {user.isAdmin ? 'Remove Admin' : 'Make Admin'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleSuspendUser(user.id, !user.isSuspended)}
                            className={user.isSuspended ? 'text-green-600' : 'text-red-600'}
                          >
                            {user.isSuspended ? 'Reactivate' : 'Suspend'} User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {hasMore && (
            <div className="mt-4 text-center">
              <Button
                variant="outline"
                onClick={() => loadUsers('', true)}
                disabled={isLoading}
              >
                Load More
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}