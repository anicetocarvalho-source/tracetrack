import { useState } from 'react';
import { HelpCircle, LayoutDashboard, Package, Building2, Users, FileText, Settings, AlertTriangle, Target, FileWarning, Grid3X3, FileBarChart, BellRing, Settings2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface ModuleInfo {
  icon: React.ElementType;
  titleKey: string;
  descriptionKey: string;
  featuresKey: string;
  roles?: string[];
}

const modules: ModuleInfo[] = [
  {
    icon: LayoutDashboard,
    titleKey: 'help.modules.dashboard.title',
    descriptionKey: 'help.modules.dashboard.description',
    featuresKey: 'help.modules.dashboard.features',
  },
  {
    icon: AlertTriangle,
    titleKey: 'help.modules.actionRequired.title',
    descriptionKey: 'help.modules.actionRequired.description',
    featuresKey: 'help.modules.actionRequired.features',
  },
  {
    icon: Package,
    titleKey: 'help.modules.shipments.title',
    descriptionKey: 'help.modules.shipments.description',
    featuresKey: 'help.modules.shipments.features',
  },
  {
    icon: FileText,
    titleKey: 'help.modules.customerRequests.title',
    descriptionKey: 'help.modules.customerRequests.description',
    featuresKey: 'help.modules.customerRequests.features',
    roles: ['SUPERVISOR', 'MANAGER'],
  },
  {
    icon: Target,
    titleKey: 'help.modules.slaManagement.title',
    descriptionKey: 'help.modules.slaManagement.description',
    featuresKey: 'help.modules.slaManagement.features',
    roles: ['SUPERVISOR', 'MANAGER'],
  },
  {
    icon: FileWarning,
    titleKey: 'help.modules.slaBreachReport.title',
    descriptionKey: 'help.modules.slaBreachReport.description',
    featuresKey: 'help.modules.slaBreachReport.features',
    roles: ['SUPERVISOR', 'MANAGER'],
  },
  {
    icon: Grid3X3,
    titleKey: 'help.modules.slaHeatmap.title',
    descriptionKey: 'help.modules.slaHeatmap.description',
    featuresKey: 'help.modules.slaHeatmap.features',
    roles: ['SUPERVISOR', 'MANAGER'],
  },
  {
    icon: FileBarChart,
    titleKey: 'help.modules.scorecards.title',
    descriptionKey: 'help.modules.scorecards.description',
    featuresKey: 'help.modules.scorecards.features',
    roles: ['SUPERVISOR', 'MANAGER'],
  },
  {
    icon: BellRing,
    titleKey: 'help.modules.notifications.title',
    descriptionKey: 'help.modules.notifications.description',
    featuresKey: 'help.modules.notifications.features',
  },
  {
    icon: Building2,
    titleKey: 'help.modules.clients.title',
    descriptionKey: 'help.modules.clients.description',
    featuresKey: 'help.modules.clients.features',
    roles: ['MANAGER'],
  },
  {
    icon: Users,
    titleKey: 'help.modules.users.title',
    descriptionKey: 'help.modules.users.description',
    featuresKey: 'help.modules.users.features',
    roles: ['MANAGER'],
  },
  {
    icon: Settings2,
    titleKey: 'help.modules.exceptionRules.title',
    descriptionKey: 'help.modules.exceptionRules.description',
    featuresKey: 'help.modules.exceptionRules.features',
    roles: ['MANAGER'],
  },
  {
    icon: FileText,
    titleKey: 'help.modules.auditLogs.title',
    descriptionKey: 'help.modules.auditLogs.description',
    featuresKey: 'help.modules.auditLogs.features',
    roles: ['MANAGER'],
  },
  {
    icon: Settings,
    titleKey: 'help.modules.settings.title',
    descriptionKey: 'help.modules.settings.description',
    featuresKey: 'help.modules.settings.features',
    roles: ['MANAGER'],
  },
];

interface HelpMenuProps {
  userRole?: string | null;
}

export function HelpMenu({ userRole }: HelpMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const filteredModules = modules.filter(module => {
    if (!module.roles) return true;
    return module.roles.includes(userRole || '');
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
          <HelpCircle className="h-5 w-5" />
          <span className="sr-only">{t('common.help')}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:w-[400px] p-0">
        <SheetHeader className="p-6 pb-4 bg-dhl-red text-white">
          <SheetTitle className="text-white flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            {t('help.title')}
          </SheetTitle>
          <p className="text-sm text-white/80">{t('help.subtitle')}</p>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-120px)]">
          <div className="p-4">
            <p className="text-sm text-muted-foreground mb-4">
              {t('help.intro')}
            </p>
            <Accordion type="single" collapsible className="w-full">
              {filteredModules.map((module, index) => {
                const Icon = module.icon;
                const features = t(module.featuresKey, { returnObjects: true }) as string[];
                
                return (
                  <AccordionItem key={index} value={`item-${index}`}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-dhl-red/10 flex items-center justify-center">
                          <Icon className="h-4 w-4 text-dhl-red" />
                        </div>
                        <span className="font-medium">{t(module.titleKey)}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="pl-11 space-y-3">
                        <p className="text-sm text-muted-foreground">
                          {t(module.descriptionKey)}
                        </p>
                        {Array.isArray(features) && features.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-foreground">{t('help.mainFeatures')}:</p>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              {features.map((feature, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                  <span className="text-dhl-red mt-1">•</span>
                                  <span>{feature}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
            
            <Separator className="my-6" />
            
            <div className="space-y-4">
              <h3 className="font-medium">{t('help.needMoreHelp')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('help.contactInfo')}
              </p>
              <Button variant="outline" className="w-full">
                {t('common.contactSupport')}
              </Button>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
