import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Package, 
  User, 
  LogOut, 
  Menu, 
  X, 
  FileBarChart, 
  FileText,
  MessageSquare
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CustomerHelpMenu } from '@/components/CustomerHelpMenu';
import { CustomerTour } from '@/components/tour/CustomerTour';
import { CustomerNotifications } from '@/components/portal/CustomerNotifications';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import dhlLogoRed from '@/assets/dhl-logo-red.svg';

interface CustomerLayoutProps {
  children: ReactNode;
}

export function CustomerLayout({ children }: CustomerLayoutProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { path: '/portal', label: t('nav.myShipments'), icon: Package },
    { path: '/portal/documents', label: t('nav.myDocuments'), icon: FileText },
    { path: '/portal/requests', label: t('nav.myRequests'), icon: MessageSquare },
    { path: '/portal/scorecard', label: t('nav.scorecard'), icon: FileBarChart },
    { path: '/portal/profile', label: t('nav.profile'), icon: User },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        data-tour="customer-sidebar"
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-dhl-yellow flex flex-col",
          "transition-all duration-300 ease-in-out lg:translate-x-0",
          "shadow-2xl lg:shadow-none",
          sidebarOpen ? "translate-x-0 animate-slide-in-left lg:animate-none" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-yellow-500 bg-dhl-yellow">
          <div className="flex items-center gap-2">
            <img src={dhlLogoRed} alt="DHL" className="h-6 w-auto" />
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="lg:hidden text-foreground hover:bg-black/10"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item, index) => {
            const isActive = location.pathname === item.path || 
              (item.path !== '/portal' && location.pathname.startsWith(item.path));
            
            const tourId = item.path === '/portal' ? 'nav-shipments' 
              : item.path === '/portal/scorecard' ? 'nav-scorecard'
              : item.path === '/portal/profile' ? 'nav-profile'
              : undefined;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                data-tour={tourId}
                style={{ animationDelay: `${index * 30}ms` }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium",
                  "transition-all duration-200 ease-out",
                  "hover:translate-x-1",
                  isActive 
                    ? "bg-dhl-red text-white shadow-md" 
                    : "text-foreground hover:bg-black/10",
                  sidebarOpen && "lg:animate-none animate-fade-in"
                )}
              >
                <item.icon className={cn(
                  "w-5 h-5 shrink-0 transition-transform duration-200",
                  isActive && "scale-110"
                )} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-yellow-500">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-dhl-red/10 flex items-center justify-center">
              <span className="text-sm font-medium text-dhl-red">
                {profile?.name?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-foreground">{profile?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{t('nav.customer')}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-foreground hover:bg-black/10"
            onClick={handleSignOut}
          >
            <LogOut className="w-4 h-4 mr-2 shrink-0" />
            <span className="truncate">{t('common.signOut')}</span>
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header data-tour="customer-header" className="h-16 border-b flex items-center px-4 lg:px-6 bg-gradient-to-r from-card to-muted/30">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden mr-3"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-xl bg-dhl-yellow/20 border border-dhl-yellow/30">
              <Package className="w-5 h-5 text-dhl-red" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">{t('nav.customerPortal')}</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                {t('common.welcome')}, {profile?.name?.split(' ')[0] || t('nav.customer')}
              </p>
            </div>
          </div>
          
          <div className="flex-1" />
          
          <div className="flex items-center gap-1 sm:gap-2">
            <CustomerTour />
            <div data-tour="customer-help">
              <CustomerHelpMenu />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <CustomerNotifications />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('notifications.title', 'Notifications')}</p>
              </TooltipContent>
            </Tooltip>
            <ThemeToggle />
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <LanguageSwitcher />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('settings.changeLanguage', 'Change language')}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
