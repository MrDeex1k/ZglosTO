import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getCityIdentity } from '../config/white-label';
import { getCurrentLocale } from '../i18n';
import { CityEmblem } from './CityEmblem';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Button } from './ui/button';

export function OperationsShell({
  children,
  onLogout,
}: Readonly<{ children: ReactNode; onLogout?: () => Promise<void> }>) {
  const { t } = useTranslation();
  const city = getCityIdentity(getCurrentLocale());

  return (
    <div className="flex min-h-dvh flex-col bg-gray-50">
      <header className="border-b bg-white">
        <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <CityEmblem className="size-9 shrink-0" />
            <span className="font-medium text-gray-900">{city.displayName}</span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="compact" />
            {onLogout && (
              <Button variant="outline" onClick={() => void onLogout()}>
                {t(($) => $.navigation.logout)}
              </Button>
            )}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
