import { ExternalLink, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { getCityIdentity, whiteLabelConfig } from '../config/white-label';
import { createGoogleMapsDirectionsUrl } from '../lib/google-maps';

export function IncidentAddressDirectionsLink({ address }: Readonly<{ address: string }>) {
  const { t } = useTranslation();
  const city = getCityIdentity(whiteLabelConfig.city.defaultLocale).displayName;

  return (
    <a
      href={createGoogleMapsDirectionsUrl(address, city)}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-2 rounded-md text-gray-900 outline-none transition-colors hover:text-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
      aria-label={t(($) => $.incidents.directions.openForAddress, { address })}
    >
      <MapPin className="mt-0.5 size-4 shrink-0 text-gray-500 group-hover:text-brand-primary" />
      <span className="min-w-0">
        <span className="block underline decoration-gray-300 underline-offset-4 group-hover:decoration-brand-primary">
          {address}
        </span>
        <span className="mt-1 block text-xs text-gray-500">
          {t(($) => $.incidents.directions.open)}
        </span>
      </span>
      <ExternalLink className="mt-0.5 size-4 shrink-0 text-gray-400" aria-hidden="true" />
    </a>
  );
}
