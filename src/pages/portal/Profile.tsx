import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Mail, Building2, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export default function Profile() {
  const { profile, user } = useAuth();

  return (
    <CustomerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Meu Perfil</h1>
          <p className="text-muted-foreground">Visualize as informações da sua conta</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Informações Pessoais
              </CardTitle>
              <CardDescription>Seus dados de cadastro</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={profile?.name || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={profile?.email || user?.email || ''} disabled />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Informações da Conta
              </CardTitle>
              <CardDescription>Detalhes da sua conta</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo de Conta</Label>
                <Input value="Cliente" disabled />
              </div>
              <div className="space-y-2">
                <Label>Membro desde</Label>
                <Input 
                  value={profile?.created_at ? format(new Date(profile.created_at), 'dd/MM/yyyy') : '-'} 
                  disabled 
                />
              </div>
              <div className="space-y-2">
                <Label>Último acesso</Label>
                <Input 
                  value={profile?.last_login_at ? format(new Date(profile.last_login_at), 'dd/MM/yyyy HH:mm') : '-'} 
                  disabled 
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Precisa de ajuda?</CardTitle>
            <CardDescription>Entre em contato com o seu representante DHL</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Para atualizar suas informações de perfil ou solicitar alterações na sua conta, 
              entre em contato com o suporte DHL.
            </p>
            <Button variant="outline">Contactar Suporte</Button>
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
}
