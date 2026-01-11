import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { NotificationPreferences } from '@/components/portal/NotificationPreferences';

export default function Profile() {
  const { t } = useTranslation();
  const { profile, user } = useAuth();

  return (
    <CustomerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t('profile.title')}</h1>
          <p className="text-muted-foreground">{t('profile.subtitle')}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                {t('profile.personalInfo')}
              </CardTitle>
              <CardDescription>{t('profile.personalInfoDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('common.name')}</Label>
                <Input value={profile?.name || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>{t('common.email')}</Label>
                <Input value={profile?.email || user?.email || ''} disabled />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                {t('profile.accountInfo')}
              </CardTitle>
              <CardDescription>{t('profile.accountInfoDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('profile.accountType')}</Label>
                <Input value={t('profile.customer')} disabled />
              </div>
              <div className="space-y-2">
                <Label>{t('profile.memberSince')}</Label>
                <Input 
                  value={profile?.created_at ? format(new Date(profile.created_at), 'dd/MM/yyyy') : '-'} 
                  disabled 
                />
              </div>
              <div className="space-y-2">
                <Label>{t('profile.lastAccess')}</Label>
                <Input 
                  value={profile?.last_login_at ? format(new Date(profile.last_login_at), 'dd/MM/yyyy HH:mm') : '-'} 
                  disabled 
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <NotificationPreferences />

        <Card>
          <CardHeader>
            <CardTitle>{t('profile.needHelp')}</CardTitle>
            <CardDescription>{t('profile.needHelpDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {t('profile.updateProfileInfo')}
            </p>
            <Button variant="outline">{t('common.contactSupport')}</Button>
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
}
