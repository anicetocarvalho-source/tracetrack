import { ReactNode, useState } from 'react';
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
  FileWarning,
  X,
  AlertTriangle,
  Settings2,
  Target,
  BellRing,
  Grid3X3,
  FileBarChart,
  ChevronDown,
  ChevronRight,
  Clock,
  Cog,
  Zap,
  Plus,
  Eye,
  BarChart3,
  TrendingUp,
  ArrowRightLeft,
  Globe
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PreferencesSyncIndicator } from '@/components/PreferencesSyncIndicator';
import { HelpMenu } from '@/components/HelpMenu';
import { BackofficeTour } from '@/components/tour/BackofficeTour';
import { BranchSelector } from '@/components/BranchSelector';
import { CountrySelector } from '@/components/CountrySelector';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import dhlLogoRed from '@/assets/dhl-logo-red.svg';

interface BackofficeLayoutProps {
  children: ReactNode;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
  highlight?: boolean;
}

interface NavGroup {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
  items: NavItem[];
}

type NavEntry = NavItem | NavGroup;

function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'items' in entry;
}

export function BackofficeLayout({ children }: BackofficeLayoutProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, role, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>(['sla', 'admin']);

  const navEntries: NavEntry[] = [
    { path: '/backoffice', label: t('nav.dashboard'), icon: LayoutDashboard },
    { path: '/backoffice/country-dashboard', label: t('nav.countryDashboard'), icon: Globe, roles: ['ADMIN', 'COUNTRY_ADMIN'] },
    { path: '/backoffice/branch-dashboard', label: t('nav.branchDashboard'), icon: BarChart3 },
    { path: '/backoffice/branch-comparison', label: t('nav.branchComparison'), icon: TrendingUp },
    { path: '/backoffice/branch-transfer-history', label: t('nav.branchTransferHistory'), icon: ArrowRightLeft, roles: ['ADMIN', 'SUPERVISOR', 'MANAGER'] },
    { path: '/backoffice/action-required', label: t('exceptions.title'), icon: AlertTriangle, highlight: true },
    { path: '/backoffice/shipments', label: t('nav.shipments'), icon: Package },
    { path: '/backoffice/customer-requests', label: t('nav.customerRequests'), icon: FileText, roles: ['ADMIN', 'COUNTRY_ADMIN', 'SUPERVISOR', 'MANAGER'] },
    // SLA Group
    {
      label: t('nav.slaGroup'),
      icon: Clock,
      roles: ['ADMIN', 'COUNTRY_ADMIN', 'SUPERVISOR', 'MANAGER'],
      items: [
        { path: '/backoffice/sla-management', label: t('nav.slaManagement'), icon: Target, roles: ['ADMIN', 'COUNTRY_ADMIN', 'SUPERVISOR', 'MANAGER'] },
        { path: '/backoffice/sla-breach-report', label: t('nav.slaBreachReport'), icon: FileWarning, roles: ['ADMIN', 'COUNTRY_ADMIN', 'SUPERVISOR', 'MANAGER'] },
        { path: '/backoffice/sla-heatmap', label: t('nav.slaHeatmap'), icon: Grid3X3, roles: ['ADMIN', 'COUNTRY_ADMIN', 'SUPERVISOR', 'MANAGER'] },
      ]
    },
    { path: '/backoffice/scorecards', label: t('nav.scorecards'), icon: FileBarChart, roles: ['ADMIN', 'COUNTRY_ADMIN', 'SUPERVISOR', 'MANAGER'] },
    { path: '/backoffice/notification-settings', label: t('nav.notificationSettings'), icon: BellRing },
    // Admin Group
    {
      label: t('nav.adminGroup'),
      icon: Cog,
      roles: ['ADMIN', 'COUNTRY_ADMIN', 'MANAGER'],
      items: [
        { path: '/backoffice/clients', label: t('nav.clients'), icon: Building2, roles: ['ADMIN', 'COUNTRY_ADMIN', 'MANAGER'] },
        { path: '/backoffice/users', label: t('nav.users'), icon: Users, roles: ['ADMIN', 'COUNTRY_ADMIN', 'MANAGER'] },
        { path: '/backoffice/exception-rules', label: t('exceptions.rulesTitle'), icon: Settings2, roles: ['ADMIN', 'MANAGER'] },
        { path: '/backoffice/branch-management', label: t('nav.branchManagement'), icon: Building2, roles: ['ADMIN', 'COUNTRY_ADMIN', 'MANAGER'] },
        { path: '/backoffice/audit-logs', label: t('nav.auditLogs'), icon: FileText, roles: ['ADMIN', 'COUNTRY_ADMIN', 'MANAGER'] },
        { path: '/backoffice/settings', label: t('nav.settings'), icon: Settings, roles: ['ADMIN', 'MANAGER'] },
        { path: '/backoffice/system-config', label: t('nav.systemConfig'), icon: Settings2, roles: ['ADMIN'] },
      ]
    },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const toggleGroup = (groupLabel: string) => {
    setOpenGroups(prev => 
      prev.includes(groupLabel) 
        ? prev.filter(g => g !== groupLabel)
        : [...prev, groupLabel]
    );
  };

  const isEntryVisible = (entry: NavEntry): boolean => {
    if (isNavGroup(entry)) {
      if (entry.roles && !entry.roles.includes(role || '')) return false;
      return entry.items.some(item => !item.roles || item.roles.includes(role || ''));
    }
    return !entry.roles || entry.roles.includes(role || '');
  };

  const isGroupActive = (group: NavGroup): boolean => {
    return group.items.some(item => 
      location.pathname === item.path || 
      (item.path !== '/backoffice' && location.pathname.startsWith(item.path))
    );
  };

  const renderNavItem = (item: NavItem, index: number, isSubItem = false) => {
    const isActive = location.pathname === item.path || 
      (item.path !== '/backoffice' && location.pathname.startsWith(item.path));
    
    const tourId = item.path === '/backoffice' ? 'dashboard' 
      : item.path === '/backoffice/action-required' ? 'exceptions'
      : item.path === '/backoffice/shipments' ? 'shipments'
      : undefined;
    
    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={() => setSidebarOpen(false)}
        data-tour={tourId}
        style={{ animationDelay: `${index * 30}ms` }}
        className={cn(
          "flex items-center gap-3 py-2 rounded-lg text-sm font-medium text-white",
          "transition-all duration-200 ease-out",
          "hover:translate-x-1",
          isSubItem ? "px-3 pl-10" : "px-3",
          isActive 
            ? "bg-dhl-yellow !text-black shadow-md" 
            : "hover:bg-white/10",
          sidebarOpen && "lg:animate-none animate-fade-in"
        )}
      >
        <item.icon className={cn(
          "w-4 h-4 shrink-0 transition-transform duration-200",
          isActive && "scale-110"
        )} />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

  const renderNavGroup = (group: NavGroup, index: number) => {
    const groupKey = group.label.toLowerCase().replace(/\s+/g, '-');
    const isOpen = openGroups.includes(groupKey) || isGroupActive(group);
    const isActive = isGroupActive(group);
    
    return (
      <Collapsible
        key={group.label}
        open={isOpen}
        onOpenChange={() => toggleGroup(groupKey)}
      >
        <CollapsibleTrigger asChild>
          <button
            style={{ animationDelay: `${index * 30}ms` }}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-white",
              "transition-all duration-200 ease-out",
              "hover:bg-white/10",
              isActive && "bg-white/5",
              sidebarOpen && "lg:animate-none animate-fade-in"
            )}
          >
            <group.icon className="w-5 h-5 shrink-0" />
            <span className="flex-1 text-left truncate">{group.label}</span>
            {isOpen ? (
              <ChevronDown className="w-4 h-4 shrink-0 transition-transform" />
            ) : (
              <ChevronRight className="w-4 h-4 shrink-0 transition-transform" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1 mt-1">
          {group.items
            .filter(item => !item.roles || item.roles.includes(role || ''))
            .map((item, subIndex) => renderNavItem(item, index + subIndex, true))}
        </CollapsibleContent>
      </Collapsible>
    );
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
        data-tour="sidebar"
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-dhl-red text-white flex flex-col",
          "transition-all duration-300 ease-in-out lg:translate-x-0",
          "shadow-2xl lg:shadow-none",
          sidebarOpen ? "translate-x-0 animate-slide-in-left lg:animate-none" : "-translate-x-full"
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
          {navEntries.map((entry, index) => {
            if (!isEntryVisible(entry)) return null;
            
            if (isNavGroup(entry)) {
              return renderNavGroup(entry, index);
            }
            
            return renderNavItem(entry, index);
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
            <LogOut className="w-4 h-4 mr-2 shrink-0" />
            <span className="truncate">{t('common.signOut')}</span>
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
          
          {/* Country Selector - visible for COUNTRY_ADMIN and ADMIN */}
          <div data-tour="country-selector" className="mr-2">
            <CountrySelector />
          </div>
          
          {/* Branch Selector - visible in header for multi-branch users */}
          <div data-tour="branch-selector">
            <BranchSelector />
          </div>
          
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <PreferencesSyncIndicator />
            
            {/* Quick Actions Dropdown */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Zap className="h-4 w-4" />
                        <span className="hidden sm:inline">{t('quickActions.title')}</span>
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>{t('quickActions.title')}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => navigate('/backoffice/shipments/new')}>
                        <Plus className="mr-2 h-4 w-4" />
                        {t('quickActions.createShipment')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate('/backoffice/action-required')}>
                        <AlertTriangle className="mr-2 h-4 w-4" />
                        {t('quickActions.viewExceptions')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate('/backoffice/customer-requests')}>
                        <FileText className="mr-2 h-4 w-4" />
                        {t('quickActions.viewRequests')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => navigate('/backoffice/sla-breach-report')}>
                        <Eye className="mr-2 h-4 w-4" />
                        {t('quickActions.slaBreaches')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate('/backoffice/scorecards')}>
                        <BarChart3 className="mr-2 h-4 w-4" />
                        {t('quickActions.viewScorecards')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('quickActions.tooltip', 'Quick access to common actions')}</p>
              </TooltipContent>
            </Tooltip>
            
            <BackofficeTour />
            <div data-tour="help-button">
              <HelpMenu userRole={role} />
            </div>
            <div data-tour="theme-toggle">
              <ThemeToggle />
            </div>
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
