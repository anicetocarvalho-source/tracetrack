import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Search, Users as UsersIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { AppRole } from '@/lib/constants';
import type { Profile, Client, UserRole } from '@/types/database';

interface UserWithRole extends Profile {
  role: AppRole | null;
  user_roles: UserRole[];
}

const PAGE_SIZE = 20;

const Users = () => {
  const { t } = useTranslation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [formData, setFormData] = useState({ email: '', password: '', name: '', role: '' as AppRole | '', client_id: '' });
  const [editFormData, setEditFormData] = useState({ role: '' as AppRole | '', client_id: '', is_active: true });

  const { toast } = useToast();
  const { role: currentUserRole, user } = useAuth();
  const queryClient = useQueryClient();
  const isManager = currentUserRole === 'MANAGER';
  const isSupervisor = currentUserRole === 'SUPERVISOR';
  const canManageUsers = isManager || isSupervisor;

  // Roles that the current user can assign
  const allowedRoles: AppRole[] = isManager 
    ? ['MANAGER', 'SUPERVISOR', 'TECHNICIAN', 'CUSTOMER']
    : ['TECHNICIAN', 'CUSTOMER']; // Supervisors can only assign these roles

  const { data, isLoading } = useQuery({
    queryKey: ['users', page],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('profiles')
        .select(`*, user_roles (*)`, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      const users = (data || []).map((u: any) => ({ ...u, role: u.user_roles?.[0]?.role || null })) as UserWithRole[];
      return { users, totalCount: count || 0 };
    },
  });

  const users = data?.users || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNextPage = page < totalPages - 1;
  const hasPrevPage = page > 0;

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').order('name');
      if (error) throw error;
      return data as Client[];
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: result, error } = await supabase.functions.invoke('create-user', {
        body: { email: data.email, password: data.password, name: data.name, role: data.role, client_id: data.client_id || null },
      });
      if (error) throw error;
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsCreateOpen(false);
      setFormData({ email: '', password: '', name: '', role: '', client_id: '' });
      toast({ title: t('users.userCreatedSuccess') });
    },
    onError: (error: Error) => {
      toast({ title: t('users.errorCreatingUser'), description: error.message, variant: 'destructive' });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data, previousData }: { userId: string; data: typeof editFormData; previousData: { role: AppRole | null; client_id: string | null; is_active: boolean } }) => {
      const changes: Record<string, { before: any; after: any }> = {};

      // Track changes for audit log
      if (data.client_id !== previousData.client_id) {
        changes.client_id = { before: previousData.client_id, after: data.client_id || null };
      }
      if (data.is_active !== previousData.is_active) {
        changes.is_active = { before: previousData.is_active, after: data.is_active };
      }
      if (data.role !== previousData.role) {
        changes.role = { before: previousData.role, after: data.role };
      }

      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ client_id: data.client_id || null, is_active: data.is_active })
        .eq('id', userId);
      if (profileError) throw profileError;

      // Update role if changed
      if (data.role && data.role !== previousData.role) {
        await supabase.from('user_roles').delete().eq('user_id', userId);
        const { error: roleError } = await supabase.from('user_roles').insert({ user_id: userId, role: data.role });
        if (roleError) throw roleError;

        // Log PERMISSION_CHANGE
        await supabase.from('audit_log').insert({
          entity_type: 'PERMISSION',
          entity_id: userId,
          action: 'PERMISSION_CHANGE',
          actor_user_id: user?.id,
          metadata_json: {
            previous_role: previousData.role,
            new_role: data.role,
            previous_client_id: previousData.client_id,
            new_client_id: data.client_id || null,
            changes,
          },
        });
      } else if (Object.keys(changes).length > 0) {
        // Log profile update with changes
        await supabase.from('audit_log').insert({
          entity_type: 'user',
          entity_id: userId,
          action: 'UPDATE',
          actor_user_id: user?.id,
          metadata_json: { changes },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsEditOpen(false);
      setSelectedUser(null);
      toast({ title: t('users.userUpdatedSuccess') });
    },
    onError: (error: Error) => {
      toast({ title: t('users.errorUpdatingUser'), description: error.message, variant: 'destructive' });
    },
  });

  const handleCreate = () => {
    if (!formData.email || !formData.password || !formData.name || !formData.role) {
      toast({ title: t('users.fillAllFields'), variant: 'destructive' });
      return;
    }
    if (formData.role === 'CUSTOMER' && !formData.client_id) {
      toast({ title: t('users.customerMustHaveClient'), variant: 'destructive' });
      return;
    }
    // Check if supervisor is trying to create a role they don't have permission for
    if (!allowedRoles.includes(formData.role as AppRole)) {
      toast({ title: t('users.noPermissionForRole'), variant: 'destructive' });
      return;
    }
    createUserMutation.mutate(formData);
  };

  // Check if current user can edit a specific user based on their role
  const canEditUser = (userRole: AppRole | null): boolean => {
    if (isManager) return true;
    if (isSupervisor) {
      // Supervisors can only edit TECHNICIAN and CUSTOMER
      return userRole === 'TECHNICIAN' || userRole === 'CUSTOMER' || userRole === null;
    }
    return false;
  };

  const handleEdit = (u: UserWithRole) => {
    setSelectedUser(u);
    setEditFormData({ role: u.role || '', client_id: u.client_id || '', is_active: u.is_active });
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedUser) return;
    if (editFormData.role === 'CUSTOMER' && !editFormData.client_id) {
      toast({ title: t('users.customerMustHaveClient'), variant: 'destructive' });
      return;
    }
    // Check if user has permission to assign the selected role
    if (editFormData.role && !allowedRoles.includes(editFormData.role as AppRole)) {
      toast({ title: t('users.noPermissionForRole'), variant: 'destructive' });
      return;
    }
    updateUserMutation.mutate({
      userId: selectedUser.id,
      data: editFormData,
      previousData: {
        role: selectedUser.role,
        client_id: selectedUser.client_id,
        is_active: selectedUser.is_active,
      },
    });
  };

  const filteredUsers = users.filter((u) => 
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const getClientName = (clientId: string | null) => clientId ? clients.find((c) => c.id === clientId)?.name || '-' : '-';

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('users.title')}</h1>
            <p className="text-muted-foreground">{t('users.subtitle')}</p>
          </div>
          {canManageUsers && (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />{t('users.addUser')}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t('users.createUser')}</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>{t('common.email')} *</Label>
                    <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('common.password')} *</Label>
                    <Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder={t('users.minPassword')} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('users.fullName')} *</Label>
                    <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('users.role')} *</Label>
                    <Select value={formData.role} onValueChange={(v: AppRole) => setFormData({ ...formData, role: v })}>
                      <SelectTrigger><SelectValue placeholder={t('users.selectRole')} /></SelectTrigger>
                      <SelectContent>
                        {allowedRoles.map((r) => (
                          <SelectItem key={r} value={r}>{t(`roles.${r}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.role === 'CUSTOMER' && (
                    <div className="space-y-2">
                      <Label>{t('shipments.client')} *</Label>
                      <Select value={formData.client_id} onValueChange={(v) => setFormData({ ...formData, client_id: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => setIsCreateOpen(false)}>{t('common.cancel')}</Button>
                    <Button onClick={handleCreate} disabled={createUserMutation.isPending}>
                      {createUserMutation.isPending ? t('common.creating') : t('users.createUser')}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder={t('users.searchUsers')} 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className="pl-9" 
          />
        </div>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('common.email')}</TableHead>
                <TableHead>{t('users.role')}</TableHead>
                <TableHead>{t('shipments.client')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('shipments.createdAt')}</TableHead>
                {canManageUsers && <TableHead>{t('common.actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <UsersIcon className="h-5 w-5 animate-pulse inline mr-2" />
                    {t('users.loadingUsers')}
                  </TableCell>
                </TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {t('users.noUsers')}
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      {u.role ? <Badge>{t(`roles.${u.role}`)}</Badge> : <span className="text-muted-foreground">{t('common.noRole')}</span>}
                    </TableCell>
                    <TableCell>{getClientName(u.client_id)}</TableCell>
                    <TableCell>
                      <Badge variant={u.is_active ? 'default' : 'secondary'}>
                        {u.is_active ? t('common.active') : t('common.inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(u.created_at).toLocaleDateString()}</TableCell>
                    {canManageUsers && (
                      <TableCell>
                        {canEditUser(u.role) ? (
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(u)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t('users.noPermission')}</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-sm text-muted-foreground">
                {t('common.showing')} {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalCount)} {t('common.of')} {totalCount}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={!hasPrevPage}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm">{page + 1} / {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={!hasNextPage}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('users.editUser')}</DialogTitle></DialogHeader>
            {selectedUser && (
              <div className="space-y-4 pt-4">
                <div>
                  <Label className="text-muted-foreground">{t('common.email')}</Label>
                  <p className="font-medium">{selectedUser.email}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">{t('common.name')}</Label>
                  <p className="font-medium">{selectedUser.name}</p>
                </div>
                <div className="space-y-2">
                  <Label>{t('users.role')}</Label>
                  <Select value={editFormData.role} onValueChange={(v: AppRole) => setEditFormData({ ...editFormData, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {allowedRoles.map((r) => (
                        <SelectItem key={r} value={r}>{t(`roles.${r}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {editFormData.role === 'CUSTOMER' && (
                  <div className="space-y-2">
                    <Label>{t('shipments.client')}</Label>
                    <Select value={editFormData.client_id} onValueChange={(v) => setEditFormData({ ...editFormData, client_id: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <Label>{t('users.isActive')}</Label>
                  <Switch 
                    checked={editFormData.is_active} 
                    onCheckedChange={(c) => setEditFormData({ ...editFormData, is_active: c })} 
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setIsEditOpen(false)}>{t('common.cancel')}</Button>
                  <Button onClick={handleUpdate} disabled={updateUserMutation.isPending}>
                    {updateUserMutation.isPending ? t('common.saving') : t('users.saveChanges')}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </BackofficeLayout>
  );
};

export default Users;
