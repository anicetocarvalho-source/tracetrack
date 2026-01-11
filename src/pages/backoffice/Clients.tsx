import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BackofficeLayout } from '@/components/layouts/BackofficeLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';
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
import { Plus, Pencil, X, Building2, Search, Users, Mail, Calendar, LayoutGrid, List, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { safeFormatDate } from '@/lib/utils';
import type { Client } from '@/types/database';
import { motion, AnimatePresence } from 'framer-motion';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
};

export default function Clients() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [name, setName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [showFilters, setShowFilters] = useState(false);
  const [filterHasEmails, setFilterHasEmails] = useState<'all' | 'with' | 'without'>('all');

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

  // Fetch stats
  const stats = {
    total: clients?.length || 0,
    withEmails: clients?.filter(c => c.notification_emails && c.notification_emails.length > 0).length || 0,
    withoutEmails: clients?.filter(c => !c.notification_emails || c.notification_emails.length === 0).length || 0,
    recentlyAdded: clients?.filter(c => {
      const created = new Date(c.created_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return created >= thirtyDaysAgo;
    }).length || 0,
  };

  // Filter clients
  const filteredClients = clients?.filter(client => {
    const matchesSearch = !search || 
      client.name.toLowerCase().includes(search.toLowerCase()) ||
      client.notification_emails?.some(e => e.toLowerCase().includes(search.toLowerCase()));
    
    const matchesEmailFilter = 
      filterHasEmails === 'all' ||
      (filterHasEmails === 'with' && client.notification_emails && client.notification_emails.length > 0) ||
      (filterHasEmails === 'without' && (!client.notification_emails || client.notification_emails.length === 0));

    return matchesSearch && matchesEmailFilter;
  }) || [];

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

  const statsCards = [
    {
      label: t('clients.totalClients'),
      value: stats.total,
      icon: Building2,
      color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      iconBg: 'bg-blue-500/20',
      filter: 'all' as const,
    },
    {
      label: t('clients.withEmails'),
      value: stats.withEmails,
      icon: Mail,
      color: 'bg-green-500/10 text-green-600 dark:text-green-400',
      iconBg: 'bg-green-500/20',
      filter: 'with' as const,
    },
    {
      label: t('clients.withoutEmails'),
      value: stats.withoutEmails,
      icon: Users,
      color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-500/20',
      filter: 'without' as const,
    },
    {
      label: t('clients.recentlyAdded'),
      value: stats.recentlyAdded,
      icon: Calendar,
      color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
      iconBg: 'bg-purple-500/20',
      filter: 'all' as const,
    },
  ];

  const hasActiveFilters = filterHasEmails !== 'all' || search;

  return (
    <BackofficeLayout>
      <motion.div 
        className="space-y-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Header */}
        <motion.div 
          variants={itemVariants}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('clients.title')}</h1>
            <p className="text-muted-foreground mt-1">{t('clients.subtitle')}</p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            {t('clients.addClient')}
          </Button>
        </motion.div>

        {/* Stats Cards */}
        <motion.div 
          variants={itemVariants}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {statsCards.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card 
                className={`${stat.color} border-0 hover:shadow-md transition-all duration-300 cursor-pointer group`}
                onClick={() => {
                  if (stat.filter !== 'all') {
                    setFilterHasEmails(stat.filter);
                  } else {
                    setFilterHasEmails('all');
                  }
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium opacity-80">{stat.label}</p>
                      <p className="text-2xl font-bold mt-1 group-hover:scale-105 transition-transform">
                        {stat.value}
                      </p>
                    </div>
                    <div className={`${stat.iconBg} p-3 rounded-xl`}>
                      <stat.icon className="w-5 h-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Search and Filters */}
        <motion.div variants={itemVariants}>
          <Card className="border-muted/50">
            <CardContent className="p-4">
              <div className="flex flex-col gap-4">
                {/* Main Search Row */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder={t('clients.searchPlaceholder')}
                      className="pl-10 h-10"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => setShowFilters(!showFilters)}
                      className={showFilters ? 'bg-muted' : ''}
                    >
                      <Filter className="w-4 h-4 mr-2" />
                      {t('common.filters')}
                      {hasActiveFilters && (
                        <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                          {(filterHasEmails !== 'all' ? 1 : 0) + (search ? 1 : 0)}
                        </Badge>
                      )}
                    </Button>
                    <div className="flex border rounded-md">
                      <Toggle
                        pressed={viewMode === 'table'}
                        onPressedChange={() => setViewMode('table')}
                        className="rounded-r-none border-r"
                        aria-label="Table view"
                      >
                        <List className="w-4 h-4" />
                      </Toggle>
                      <Toggle
                        pressed={viewMode === 'cards'}
                        onPressedChange={() => setViewMode('cards')}
                        className="rounded-l-none"
                        aria-label="Card view"
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </Toggle>
                    </div>
                  </div>
                </div>

                {/* Expandable Filters */}
                <AnimatePresence>
                  {showFilters && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t">
                        <div className="flex gap-2">
                          <Button
                            variant={filterHasEmails === 'all' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilterHasEmails('all')}
                          >
                            {t('common.all')}
                          </Button>
                          <Button
                            variant={filterHasEmails === 'with' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilterHasEmails('with')}
                          >
                            {t('clients.withEmails')}
                          </Button>
                          <Button
                            variant={filterHasEmails === 'without' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilterHasEmails('without')}
                          >
                            {t('clients.withoutEmails')}
                          </Button>
                        </div>
                        {hasActiveFilters && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              setFilterHasEmails('all');
                              setSearch('');
                            }}
                          >
                            <X className="w-4 h-4 mr-1" />
                            {t('common.clearFilters')}
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Content */}
        <motion.div variants={itemVariants}>
          {isLoading ? (
            <Card className="border-muted/50">
              <CardContent className="py-16">
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4" />
                  <p>{t('common.loading')}</p>
                </div>
              </CardContent>
            </Card>
          ) : filteredClients.length === 0 ? (
            <Card className="border-muted/50">
              <CardContent className="py-16">
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <Building2 className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">{t('clients.noClients')}</p>
                  <p className="text-sm mt-1">{t('clients.noClientsDesc')}</p>
                  {hasActiveFilters && (
                    <Button 
                      variant="outline" 
                      className="mt-4"
                      onClick={() => {
                        setFilterHasEmails('all');
                        setSearch('');
                      }}
                    >
                      {t('common.clearFilters')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : viewMode === 'table' ? (
            <Card className="border-muted/50 overflow-hidden">
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
                  {filteredClients.map((client, index) => (
                    <motion.tr
                      key={client.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="bg-primary/10 p-2 rounded-lg">
                            <Building2 className="w-4 h-4 text-primary" />
                          </div>
                          <span className="font-medium">{client.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {client.notification_emails?.length ? (
                            client.notification_emails.slice(0, 3).map((email) => (
                              <Badge key={email} variant="secondary" className="text-xs">
                                {email}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground text-sm">{t('clients.noEmailsConfigured')}</span>
                          )}
                          {client.notification_emails && client.notification_emails.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{client.notification_emails.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {safeFormatDate(client.created_at, 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(client)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </motion.tr>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredClients.map((client, index) => (
                <motion.div
                  key={client.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <Card className="hover:shadow-lg transition-all duration-300 group">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary/10 p-2.5 rounded-xl group-hover:bg-primary/20 transition-colors">
                            <Building2 className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-semibold">{client.name}</h3>
                            <p className="text-xs text-muted-foreground">
                              {safeFormatDate(client.created_at, 'MMM d, yyyy')}
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(client)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="w-4 h-4" />
                          <span>{t('clients.notificationEmails')}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {client.notification_emails?.length ? (
                            client.notification_emails.slice(0, 2).map((email) => (
                              <Badge key={email} variant="secondary" className="text-xs">
                                {email}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground text-xs italic">{t('clients.noEmailsConfigured')}</span>
                          )}
                          {client.notification_emails && client.notification_emails.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{client.notification_emails.length - 2}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Results count */}
        {!isLoading && filteredClients.length > 0 && (
          <motion.div 
            variants={itemVariants}
            className="text-sm text-muted-foreground text-center"
          >
            {t('common.showing')} {filteredClients.length} {t('common.of')} {clients?.length || 0} {t('clients.clients')}
          </motion.div>
        )}
      </motion.div>

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
