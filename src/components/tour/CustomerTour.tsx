import { useTranslation } from 'react-i18next';
import { useTourGuide } from './useTourGuide';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

export function CustomerTour() {
  const { t } = useTranslation();

  const steps = [
    {
      selector: '[data-tour="customer-header"]',
      content: (
        <div className="space-y-2">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-dhl-yellow" />
            {t('tour.customer.welcome.title')}
          </h3>
          <p className="text-muted-foreground">
            {t('tour.customer.welcome.content')}
          </p>
        </div>
      ),
    },
    {
      selector: '[data-tour="nav-shipments"]',
      content: (
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">{t('tour.customer.shipments.title')}</h3>
          <p className="text-muted-foreground">
            {t('tour.customer.shipments.content')}
          </p>
        </div>
      ),
    },
    {
      selector: '[data-tour="nav-scorecard"]',
      content: (
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">{t('tour.customer.scorecard.title')}</h3>
          <p className="text-muted-foreground">
            {t('tour.customer.scorecard.content')}
          </p>
        </div>
      ),
    },
    {
      selector: '[data-tour="nav-profile"]',
      content: (
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">{t('tour.customer.profile.title')}</h3>
          <p className="text-muted-foreground">
            {t('tour.customer.profile.content')}
          </p>
        </div>
      ),
    },
    {
      selector: '[data-tour="customer-help"]',
      content: (
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">{t('tour.customer.help.title')}</h3>
          <p className="text-muted-foreground">
            {t('tour.customer.help.content')}
          </p>
        </div>
      ),
    },
  ];

  const { hasSeenTour, startTour } = useTourGuide({
    tourId: 'customer-intro',
    steps,
  });

  // Show "Start Tour" button for users who have already seen the tour
  if (hasSeenTour) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={startTour}
        className="gap-2"
        data-tour="start-tour"
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden sm:inline">{t('tour.startTour')}</span>
      </Button>
    );
  }

  return null;
}
