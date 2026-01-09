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
import { Plus, Pencil, Search, Users as UsersIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { AppRole } from '@/lib/constants';
import type { Profile, Client, UserRole } from '@/types/database';

interface UserWithRole extends Profile {
  role: AppRole | null;
  user_roles: UserRole[];
}

const Users = () => {
  const { t } = useTranslation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({ email: '', password: '', name: '', role: '' as AppRole | '', client_id: '' });
  const [editFormData, setEditFormData] = useState({ role: '' as AppRole | '', client_id: '', is_active: true });

  const { toast } = useToast();
  const { role: currentUserRole } = useAuth();
  const queryClient = useQueryClient();
  const isManager = currentUserRole === 'MANAGER';

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select(`*, user_roles (*)`).order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((user: any) => ({ ...user, role: user.user_roles?.[0]?.role || null })) as UserWithRole[];
    },
  });

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
    mutationFn: async ({ userId, data }: { userId: string; data: typeof editFormData }) => {
      const { error: profileError } = await supabase.from('profiles').update({ client_id: data.client_id || null, is_active: data.is_active }).eq('id', userId);
      if (profileError) throw profileError;
      if (data.role) {
        await supabase.from('user_roles').delete().eq('user_id', userId);
        const { error: roleError } = await supabase.from('user_roles').insert({ user_id: userId, role: data.role });
        if (roleError) throw roleError;
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
    createUserMutation.mutate(formData);
  };

  const handleEdit = (user: UserWithRole) => {
    setSelectedUser(user);
    setEditFormData({ role: user.role || '', client_id: user.client_id || '', is_active: user.is_active });
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedUser) return;
    if (editFormData.role === 'CUSTOMER' && !editFormData.client_id) {
      toast({ title: t('users.customerMustHaveClient'), variant: 'destructive' });
      return;
    }
    updateUserMutation.mutate({ userId: selectedUser.id, data: editFormData });
  };

  const filteredUsers = users.filter((user) => user.name.toLowerCase().includes(searchQuery.toLowerCase()) || user.email.toLowerCase().includes(searchQuery.toLowerCase()));
  const getClientName = (clientId: string | null) => clientId ? clients.find((c) => c.id === clientId)?.name || '-' : '-';

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('users.title')}</h1>
            <p className="text-muted-foreground">{t('users.subtitle')}</p>
          </div>
          {isManager && (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{t('users.addUser')}</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t('users.createUser')}</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2"><Label>{t('common.email')} *</Label><Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} /></div>
                  <div className="space-y-2"><Label>{t('common.password')} *</Label><Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder={t('users.minPassword')} /></div>
                  <div className="space-y-2"><Label>{t('users.fullName')} *</Label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
                  <div className="space-y-2"><Label>{t('users.role')} *</Label><Select value={formData.role} onValueChange={(v: AppRole) => setFormData({ ...formData, role: v })}><SelectTrigger><SelectValue placeholder={t('users.selectRole')} /></SelectTrigger><SelectContent>{(['MANAGER', 'SUPERVISOR', 'TECHNICIAN', 'CUSTOMER'] as AppRole[]).map((r) => <SelectItem key={r} value={r}>{t(`roles.${r}`)}</SelectItem>)}</SelectContent></Select></div>
                  {formData.role === 'CUSTOMER' && <div className="space-y-2"><Label>{t('shipments.client')} *</Label><Select value={formData.client_id} onValueChange={(v) => setFormData({ ...formData, client_id: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>}
                  <div className="flex justify-end gap-2 pt-4"><Button variant="outline" onClick={() => setIsCreateOpen(false)}>{t('common.cancel')}</Button><Button onClick={handleCreate} disabled={createUserMutation.isPending}>{createUserMutation.isPending ? t('common.creating') : t('users.createUser')}</Button></div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder={t('users.searchUsers')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>{t('common.name')}</TableHead><TableHead>{t('common.email')}</TableHead><TableHead>{t('users.role')}</TableHead><TableHead>{t('shipments.client')}</TableHead><TableHead>{t('common.status')}</TableHead><TableHead>{t('shipments.createdAt')}</TableHead>{isManager && <TableHead>{t('common.actions')}</TableHead>}</TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={7} className="text-center py-8"><UsersIcon className="h-5 w-5 animate-pulse inline mr-2" />{t('users.loadingUsers')}</TableCell></TableRow> : filteredUsers.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t('users.noUsers')}</TableCell></TableRow> : filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.role ? <Badge>{t(`roles.${user.role}`)}</Badge> : <span className="text-muted-foreground">{t('common.noRole')}</span>}</TableCell>
                  <TableCell>{getClientName(user.client_id)}</TableCell>
                  <TableCell><Badge variant={user.is_active ? 'default' : 'secondary'}>{user.is_active ? t('common.active') : t('common.inactive')}</Badge></TableCell>
                  <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                  {isManager && <TableCell><Button variant="ghost" size="icon" onClick={() => handleEdit(user)}><Pencil className="h-4 w-4" /></Button></TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('users.editUser')}</DialogTitle></DialogHeader>
            {selectedUser && (
              <div className="space-y-4 pt-4">
                <div><Label className="text-muted-foreground">{t('common.email')}</Label><p className="font-medium">{selectedUser.email}</p></div>
                <div><Label className="text-muted-foreground">{t('common.name')}</Label><p className="font-medium">{selectedUser.name}</p></div>
                <div className="space-y-2"><Label>{t('users.role')}</Label><Select value={editFormData.role} onValueChange={(v: AppRole) => setEditFormData({ ...editFormData, role: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(['MANAGER', 'SUPERVISOR', 'TECHNICIAN', 'CUSTOMER'] as AppRole[]).map((r) => <SelectItem key={r} value={r}>{t(`roles.${r}`)}</SelectItem>)}</SelectContent></Select></div>
                {editFormData.role === 'CUSTOMER' && <div className="space-y-2"><Label>{t('shipments.client')}</Label><Select value={editFormData.client_id} onValueChange={(v) => setEditFormData({ ...editFormData, client_id: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>}
                <div className="flex items-center justify-between"><Label>{t('users.isActive')}</Label><Switch checked={editFormData.is_active} onCheckedChange={(c) => setEditFormData({ ...editFormData, is_active: c })} /></div>
                <div className="flex justify-end gap-2 pt-4"><Button variant="outline" onClick={() => setIsEditOpen(false)}>{t('common.cancel')}</Button><Button onClick={handleUpdate} disabled={updateUserMutation.isPending}>{updateUserMutation.isPending ? t('common.saving') : t('users.saveChanges')}</Button></div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </BackofficeLayout>
  );
};

export default Users;
