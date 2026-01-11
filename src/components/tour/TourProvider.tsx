import { TourProvider as ReactTourProvider } from '@reactour/tour';
import { ReactNode } from 'react';
import { X } from 'lucide-react';

interface TourProviderProps {
  children: ReactNode;
}

export function TourProvider({ children }: TourProviderProps) {
  return (
    <ReactTourProvider
      steps={[]}
      styles={{
        popover: (base) => ({
          ...base,
          borderRadius: '12px',
          padding: '20px',
          maxWidth: '380px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
        }),
        maskWrapper: (base) => ({
          ...base,
          color: 'rgba(0, 0, 0, 0.5)',
        }),
        badge: (base) => ({
          ...base,
          backgroundColor: 'hsl(var(--primary))',
        }),
        controls: (base) => ({
          ...base,
          marginTop: '16px',
        }),
        close: (base) => ({
          ...base,
          right: 12,
          top: 12,
        }),
      }}
      onClickClose={({ setIsOpen }) => setIsOpen(false)}
      onClickMask={({ setIsOpen }) => setIsOpen(false)}
      showBadge={false}
    >
      {children}
    </ReactTourProvider>
  );
}
