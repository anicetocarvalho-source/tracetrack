import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Package, Truck, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import dhlLogoWhite from '@/assets/dhl-logo-white.svg';
import dhlLogoRed from '@/assets/dhl-logo-red.svg';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Auth() {
  const navigate = useNavigate();
  const { signIn, isInternalUser, role } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const handleLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    const { error } = await signIn(data.email, data.password);
    setIsLoading(false);

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Login Failed',
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
            Track your shipments in real-time with complete visibility from origin to destination.
          </p>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Package className="w-5 h-5" />
              </div>
              <span className="text-lg">Real-time shipment tracking</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <MapPin className="w-5 h-5" />
              </div>
              <span className="text-lg">Complete transit visibility</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Truck className="w-5 h-5" />
              </div>
              <span className="text-lg">Delivery status updates</span>
            </div>
          </div>
          <p className="mt-12 text-sm text-white/60">
            Excellence. Simply delivered.
          </p>
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="flex-1 flex items-center justify-center bg-dhl-yellow p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-block mb-4">
              <img src={dhlLogoRed} alt="DHL" className="h-10 w-auto" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Shipment Tracking Portal</h1>
          </div>

          <Card className="border-0 shadow-2xl">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-2xl">Welcome</CardTitle>
              <CardDescription>
                Sign in to access your shipment tracking dashboard
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
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input 
                            type="email" 
                            placeholder="you@company.com" 
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
                        <FormLabel>Password</FormLabel>
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
                    Sign In
                  </Button>
                </form>
              </Form>

              <div className="mt-6 pt-6 border-t text-center">
                <p className="text-sm text-muted-foreground">
                  Need access? Contact your DHL representative.
                </p>
              </div>
            </CardContent>
          </Card>

          <p className="text-center text-sm text-foreground/60 mt-6">
            © {new Date().getFullYear()} DHL International GmbH. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
