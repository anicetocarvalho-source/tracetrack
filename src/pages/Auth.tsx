import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Package, Truck, MapPin, Zap, Shield, Users, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import dhlLogoRed from '@/assets/dhl-logo-red.svg';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

// Quick access demo accounts
const quickAccessAccounts = [
  { 
    label: 'Manager',
    email: 'manager@dhl.com', 
    password: 'manager123',
    icon: Shield,
    description: 'Acesso completo'
  },
  { 
    label: 'Supervisor',
    email: 'supervisor@dhl.com', 
    password: 'supervisor123',
    icon: Users,
    description: 'Gestão de equipa'
  },
  { 
    label: 'Técnico',
    email: 'technician@dhl.com', 
    password: 'technician123',
    icon: Zap,
    description: 'Operações diárias'
  },
  { 
    label: 'Cliente',
    email: 'customer@example.com', 
    password: 'customer123',
    icon: User,
    description: 'Portal do cliente'
  },
];

export default function Auth() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signIn, isInternalUser, role } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const fillQuickAccess = (email: string, password: string) => {
    form.setValue('email', email);
    form.setValue('password', password);
  };

  const handleLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    const { error } = await signIn(data.email, data.password);
    setIsLoading(false);

    if (error) {
      toast({
        variant: 'destructive',
        title: t('auth.invalidCredentials'),
        description: error.message,
      });
      return;
    }
  };

  // Redirect if already logged in with role
  if (role) {
    if (isInternalUser) {
      navigate('/backoffice', { replace: true });
    } else {
      navigate('/portal', { replace: true });
    }
    return null;
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-dhl-red relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-dhl-red via-dhl-red to-red-900" />
        
        {/* Decorative elements */}
        <div className="absolute top-20 left-10 opacity-10">
          <Package className="w-32 h-32 text-white" />
        </div>
        <div className="absolute bottom-32 right-10 opacity-10">
          <Truck className="w-40 h-40 text-white" />
        </div>
        <div className="absolute top-1/2 left-1/3 opacity-10">
          <MapPin className="w-24 h-24 text-white" />
        </div>
        
        <div className="relative z-10 flex flex-col justify-center px-12 text-white">
          <div className="bg-dhl-yellow inline-block p-4 rounded-lg mb-8 w-fit">
            <img src={dhlLogoRed} alt="DHL" className="h-10 w-auto" />
          </div>
          <h1 className="text-4xl font-bold mb-4">
            Shipment Tracking Portal
          </h1>
          <p className="text-xl text-white/80 mb-8 max-w-md">
            {t('portal.trackShipments')}
          </p>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Package className="w-5 h-5" />
              </div>
              <span className="text-lg">{t('portal.realTimeTracking')}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <MapPin className="w-5 h-5" />
              </div>
              <span className="text-lg">{t('portal.completeVisibility')}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Truck className="w-5 h-5" />
              </div>
              <span className="text-lg">{t('portal.deliveryUpdates')}</span>
            </div>
          </div>
          <p className="mt-12 text-sm text-white/60">
            {t('portal.tagline')}
          </p>
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="flex-1 flex items-center justify-center bg-dhl-yellow p-6">
        <div className="w-full max-w-md">
          {/* Language switcher */}
          <div className="absolute top-4 right-4">
            <LanguageSwitcher variant="outline" />
          </div>

          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-block mb-4">
              <img src={dhlLogoRed} alt="DHL" className="h-10 w-auto" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Shipment Tracking Portal</h1>
          </div>

          <Card className="border-0 shadow-2xl">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-2xl">{t('auth.welcome')}</CardTitle>
              <CardDescription>
                {t('auth.signInDescription')}
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-4">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-5">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('auth.email')}</FormLabel>
                        <FormControl>
                          <Input 
                            type="email" 
                            placeholder={t('auth.emailPlaceholder')} 
                            className="h-12"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('auth.password')}</FormLabel>
                        <FormControl>
                          <Input 
                            type="password" 
                            placeholder="••••••••" 
                            className="h-12"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button 
                    type="submit" 
                    className="w-full h-12 text-base font-semibold" 
                    disabled={isLoading}
                  >
                    {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {isLoading ? t('auth.signingIn') : t('auth.signIn')}
                  </Button>
                </form>
              </Form>

              {/* Quick Access Section */}
              <div className="mt-6 pt-6 border-t">
                <p className="text-xs text-muted-foreground text-center mb-3">
                  {t('auth.quickAccess')}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {quickAccessAccounts.map((account) => {
                    const Icon = account.icon;
                    return (
                      <Button
                        key={account.email}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-auto py-2 px-3 flex flex-col items-start gap-0.5"
                        onClick={() => fillQuickAccess(account.email, account.password)}
                      >
                        <div className="flex items-center gap-2 w-full">
                          <Icon className="h-3.5 w-3.5 text-dhl-red" />
                          <span className="font-medium text-xs">{account.label}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{account.description}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t text-center">
                <p className="text-sm text-muted-foreground">
                  {t('auth.needAccess')}
                </p>
              </div>
            </CardContent>
          </Card>

          <p className="text-center text-sm text-foreground/60 mt-6">
            {t('footer.copyright')}
          </p>
        </div>
      </div>
    </div>
  );
}
