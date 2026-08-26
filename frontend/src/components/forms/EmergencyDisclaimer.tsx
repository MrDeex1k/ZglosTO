import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

export function EmergencyDisclaimer() {
  const { t } = useTranslation();

  return (
    <Alert
      role="note"
      className="border-warning/40 bg-warning/10 text-warning-foreground"
      aria-labelledby="emergency-disclaimer-title"
    >
      <AlertTriangle aria-hidden="true" />
      <AlertTitle id="emergency-disclaimer-title">
        {t(($) => $.incidents.emergencyDisclaimer.title)}
      </AlertTitle>
      <AlertDescription className="text-warning-foreground">
        {t(($) => $.incidents.emergencyDisclaimer.message)}
      </AlertDescription>
    </Alert>
  );
}
