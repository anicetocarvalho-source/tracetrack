import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Package, User, LogOut, Menu, X, FileBarChart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CustomerHelpMenu } from '@/components/CustomerHelpMenu';
import { CustomerTour } from '@/components/tour/CustomerTour';
import dhlLogoRed from '@/assets/dhl-logo-red.svg';

interface CustomerLayoutProps {
  children: ReactNode;
}

export function CustomerLayout({ children }: CustomerLayoutProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { path: '/portal', label: t('nav.myShipments'), icon: Package },
    { path: '/portal/scorecard', label: t('nav.scorecard'), icon: FileBarChart },
    { path: '/portal/profile', label: t('nav.profile'), icon: User },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header data-tour="customer-header" className="sticky top-0 z-50 bg-dhl-yellow border-b border-yellow-500">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={dhlLogoRed} alt="DHL" className="h-6 w-auto" />
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item, index) => {
              const isActive = location.pathname === item.path;
              const tourId = item.path === '/portal' ? 'nav-shipments' 
                : item.path === '/portal/scorecard' ? 'nav-scorecard'
                : item.path === '/portal/profile' ? 'nav-profile'
                : undefined;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  data-tour={tourId}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
                    "transition-all duration-200 ease-out",
                    "hover:translate-y-[-2px]",
                    isActive 
                      ? "bg-primary text-primary-foreground shadow-md" 
                      : "hover:bg-muted"
                  )}
                >
                  <item.icon className={cn(
                    "w-4 h-4 transition-transform duration-200",
                    isActive && "scale-110"
                  )} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageSwitcher />
            <div data-tour="customer-help">
              <CustomerHelpMenu />
            </div>
            <CustomerTour />
            <div className="hidden sm:flex items-center gap-2 mr-2">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <span className="text-sm font-medium">
                  {profile?.name?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <span className="text-sm font-medium">{profile?.name}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="hidden md:flex"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {t('common.signOut')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t bg-card animate-fade-in">
            <div className="px-4 py-3 space-y-1">
              {navItems.map((item, index) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMenuOpen(false)}
                    style={{ animationDelay: `${index * 50}ms` }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium",
                      "transition-all duration-200 ease-out animate-fade-in",
                      "hover:translate-x-1",
                      isActive 
                        ? "bg-primary text-primary-foreground shadow-md" 
                        : "hover:bg-muted"
                    )}
                  >
                    <item.icon className={cn(
                      "w-4 h-4 shrink-0 transition-transform duration-200",
                      isActive && "scale-110"
                    )} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
              <Button
                variant="ghost"
                className="w-full justify-start transition-all duration-200 hover:translate-x-1 animate-fade-in"
                style={{ animationDelay: `${navItems.length * 50}ms` }}
                onClick={handleSignOut}
              >
                <LogOut className="w-4 h-4 mr-2 shrink-0" />
                <span className="truncate">{t('common.signOut')}</span>
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
