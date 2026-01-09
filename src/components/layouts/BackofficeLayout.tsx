import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  Building2, 
  Users, 
  FileText, 
  Settings,
  LogOut,
  Menu,
  X,
  AlertTriangle,
  Settings2,
  Target
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import dhlLogoRed from '@/assets/dhl-logo-red.svg';

interface BackofficeLayoutProps {
  children: ReactNode;
}

export function BackofficeLayout({ children }: BackofficeLayoutProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, role, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { path: '/backoffice', label: t('nav.dashboard'), icon: LayoutDashboard },
    { path: '/backoffice/action-required', label: t('exceptions.title'), icon: AlertTriangle, highlight: true },
    { path: '/backoffice/shipments', label: t('nav.shipments'), icon: Package },
    { path: '/backoffice/sla-management', label: t('nav.slaManagement'), icon: Target, roles: ['SUPERVISOR', 'MANAGER'] },
    { path: '/backoffice/clients', label: t('nav.clients'), icon: Building2, roles: ['MANAGER'] },
    { path: '/backoffice/users', label: t('nav.users'), icon: Users, roles: ['MANAGER'] },
    { path: '/backoffice/exception-rules', label: t('exceptions.rulesTitle'), icon: Settings2, roles: ['MANAGER'] },
    { path: '/backoffice/audit-logs', label: t('nav.auditLogs'), icon: FileText, roles: ['MANAGER'] },
    { path: '/backoffice/settings', label: t('nav.settings'), icon: Settings, roles: ['MANAGER'] },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const filteredNavItems = navItems.filter(item => {
    if (!item.roles) return true;
    return item.roles.includes(role || '');
  });

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-dhl-red text-white flex flex-col transition-transform lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/10 bg-dhl-yellow">
          <div className="flex items-center gap-2">
            <img src={dhlLogoRed} alt="DHL" className="h-6 w-auto" />
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="lg:hidden text-foreground hover:bg-white/20"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {filteredNavItems.map((item) => {
            const isActive = location.pathname === item.path || 
              (item.path !== '/backoffice' && location.pathname.startsWith(item.path));
            
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-white",
                  isActive 
                    ? "bg-dhl-yellow !text-black" 
                    : "hover:bg-white/10"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-sm font-medium text-white">
                {profile?.name?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-white">{profile?.name}</p>
              <p className="text-xs text-white/60 truncate">{role}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-white hover:bg-white/10"
            onClick={handleSignOut}
          >
            <LogOut className="w-4 h-4 mr-2" />
            {t('common.signOut')}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 border-b flex items-center px-4 lg:px-6 bg-card">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden mr-2"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex-1" />
          <LanguageSwitcher />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
