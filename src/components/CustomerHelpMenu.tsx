import { useState } from 'react';
import { HelpCircle, Package, FileBarChart, User, FileText, MessageSquare } from 'lucide-react';
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
}

const customerModules: ModuleInfo[] = [
  {
    icon: Package,
    titleKey: 'customerHelp.modules.myShipments.title',
    descriptionKey: 'customerHelp.modules.myShipments.description',
    featuresKey: 'customerHelp.modules.myShipments.features',
  },
  {
    icon: FileBarChart,
    titleKey: 'customerHelp.modules.scorecard.title',
    descriptionKey: 'customerHelp.modules.scorecard.description',
    featuresKey: 'customerHelp.modules.scorecard.features',
  },
  {
    icon: User,
    titleKey: 'customerHelp.modules.profile.title',
    descriptionKey: 'customerHelp.modules.profile.description',
    featuresKey: 'customerHelp.modules.profile.features',
  },
  {
    icon: FileText,
    titleKey: 'customerHelp.modules.documents.title',
    descriptionKey: 'customerHelp.modules.documents.description',
    featuresKey: 'customerHelp.modules.documents.features',
  },
  {
    icon: MessageSquare,
    titleKey: 'customerHelp.modules.requests.title',
    descriptionKey: 'customerHelp.modules.requests.description',
    featuresKey: 'customerHelp.modules.requests.features',
  },
];

export function CustomerHelpMenu() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon">
          <HelpCircle className="h-5 w-5" />
          <span className="sr-only">{t('common.help')}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:w-[400px] p-0">
        <SheetHeader className="p-6 pb-4 bg-dhl-yellow">
          <SheetTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            {t('customerHelp.title')}
          </SheetTitle>
          <p className="text-sm text-muted-foreground">{t('customerHelp.subtitle')}</p>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-120px)]">
          <div className="p-4">
            <p className="text-sm text-muted-foreground mb-4">
              {t('customerHelp.intro')}
            </p>
            <Accordion type="single" collapsible className="w-full">
              {customerModules.map((module, index) => {
                const Icon = module.icon;
                const features = t(module.featuresKey, { returnObjects: true }) as string[];
                
                return (
                  <AccordionItem key={index} value={`item-${index}`}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-dhl-yellow/30 flex items-center justify-center">
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
                            <p className="text-xs font-medium text-foreground">{t('customerHelp.mainFeatures')}:</p>
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
              <h3 className="font-medium">{t('customerHelp.needMoreHelp')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('customerHelp.contactInfo')}
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
