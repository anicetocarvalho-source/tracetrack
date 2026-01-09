import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Pencil, X, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import type { Client } from '@/types/database';

export default function Clients() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [name, setName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [emails, setEmails] = useState<string[]>([]);

  const { data: clients, isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Client[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (client: { id?: string; name: string; notification_emails: string[] }) => {
      if (client.id) {
        const { error } = await supabase
          .from('clients')
          .update({ name: client.name, notification_emails: client.notification_emails })
          .eq('id', client.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('clients')
          .insert({ name: client.name, notification_emails: client.notification_emails });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success(editingClient ? t('clients.clientUpdated') : t('clients.clientCreated'));
      closeDialog();
    },
    onError: (error) => {
      toast.error(t('clients.failedToSaveClient') + ': ' + error.message);
    },
  });

  const openCreate = () => {
    setEditingClient(null);
    setName('');
    setEmails([]);
    setEmailInput('');
    setDialogOpen(true);
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    setName(client.name);
    setEmails(client.notification_emails || []);
    setEmailInput('');
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingClient(null);
    setName('');
    setEmails([]);
    setEmailInput('');
  };

  const addEmail = () => {
    const email = emailInput.trim().toLowerCase();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !emails.includes(email)) {
      setEmails([...emails, email]);
      setEmailInput('');
    }
  };

  const removeEmail = (email: string) => {
    setEmails(emails.filter((e) => e !== email));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(t('clients.clientNameRequired'));
      return;
    }
    saveMutation.mutate({
      id: editingClient?.id,
      name: name.trim(),
      notification_emails: emails,
    });
  };

  return (
    <BackofficeLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('clients.title')}</h1>
            <p className="text-muted-foreground">{t('clients.subtitle')}</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            {t('clients.addClient')}
          </Button>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('clients.notificationEmails')}</TableHead>
                <TableHead>{t('shipments.createdAt')}</TableHead>
                <TableHead className="w-[80px]">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    {t('common.loading')}
                  </TableCell>
                </TableRow>
              ) : clients?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    {t('clients.noClients')}
                  </TableCell>
                </TableRow>
              ) : (
                clients?.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{client.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {client.notification_emails?.length ? (
                          client.notification_emails.map((email) => (
                            <Badge key={email} variant="secondary" className="text-xs">
                              {email}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground text-sm">{t('clients.noEmailsConfigured')}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(client.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(client)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingClient ? t('clients.editClient') : t('clients.addClient')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('clients.clientName')} *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('clients.clientName')}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('clients.notificationEmails')}</Label>
              <div className="flex gap-2">
                <Input
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder={t('clients.addEmailAddress')}
                  type="email"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addEmail();
                    }
                  }}
                />
                <Button type="button" variant="secondary" onClick={addEmail}>
                  {t('common.add')}
                </Button>
              </div>
              {emails.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {emails.map((email) => (
                    <Badge key={email} variant="secondary" className="pr-1">
                      {email}
                      <button
                        type="button"
                        onClick={() => removeEmail(email)}
                        className="ml-1 hover:bg-muted rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {t('clients.emailNotificationHint')}
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? t('common.saving') : editingClient ? t('common.update') : t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </BackofficeLayout>
  );
}
