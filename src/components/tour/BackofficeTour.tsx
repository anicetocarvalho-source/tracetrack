import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTourGuide } from './useTourGuide';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

export function BackofficeTour() {
  const { t } = useTranslation();

  const steps = [
    {
      selector: '[data-tour="sidebar"]',
      content: (
        <div className="space-y-2">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-dhl-yellow" />
            {t('tour.backoffice.welcome.title')}
          </h3>
          <p className="text-muted-foreground">
            {t('tour.backoffice.welcome.content')}
          </p>
        </div>
      ),
    },
    {
      selector: '[data-tour="dashboard"]',
      content: (
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">{t('tour.backoffice.dashboard.title')}</h3>
          <p className="text-muted-foreground">
            {t('tour.backoffice.dashboard.content')}
          </p>
        </div>
      ),
    },
    {
      selector: '[data-tour="exceptions"]',
      content: (
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">{t('tour.backoffice.exceptions.title')}</h3>
          <p className="text-muted-foreground">
            {t('tour.backoffice.exceptions.content')}
          </p>
        </div>
      ),
    },
    {
      selector: '[data-tour="shipments"]',
      content: (
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">{t('tour.backoffice.shipments.title')}</h3>
          <p className="text-muted-foreground">
            {t('tour.backoffice.shipments.content')}
          </p>
        </div>
      ),
    },
    {
      selector: '[data-tour="help-button"]',
      content: (
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">{t('tour.backoffice.help.title')}</h3>
          <p className="text-muted-foreground">
            {t('tour.backoffice.help.content')}
          </p>
        </div>
      ),
    },
    {
      selector: '[data-tour="theme-toggle"]',
      content: (
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">{t('tour.backoffice.settings.title')}</h3>
          <p className="text-muted-foreground">
            {t('tour.backoffice.settings.content')}
          </p>
        </div>
      ),
    },
  ];

  const { hasSeenTour, startTour, isLoading } = useTourGuide({
    tourId: 'backoffice-intro',
    steps,
  });

  // Always show the tour button in header
  if (isLoading) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={startTour}
      className="text-foreground hover:bg-accent gap-2"
      data-tour="start-tour"
    >
      <Sparkles className="h-4 w-4" />
      <span className="hidden lg:inline">{t('tour.startTour')}</span>
    </Button>
  );
}
