import type { UserRole } from '@zglosto/contracts';
import { LayoutDashboard, LogIn, LogOut, Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from './ui/button';
import { CityEmblem } from './CityEmblem';
import { LanguageSwitcher } from './LanguageSwitcher';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { getCityIdentity } from '../config/white-label';
import { getCurrentLocale } from '../i18n';

interface HeaderProps {
  onLoginClick: () => void;
  onHomeClick: () => void;
  onDashboardClick: () => void;
  onLogoutClick: () => void;
  isLoggedIn: boolean;
  userRole: UserRole;
}

export function Header({
  onLoginClick,
  onHomeClick,
  onDashboardClick,
  onLogoutClick,
  isLoggedIn,
  userRole,
}: HeaderProps) {
  const { t } = useTranslation();
  const cityName = getCityIdentity(getCurrentLocale()).displayName;

  const getDashboardButtonText = () => {
    if (!isLoggedIn) {
      return t(($) => $.navigation.login);
    }

    switch (userRole) {
      case 'admin':
        return t(($) => $.navigation.adminDashboard);
      case 'sluzby':
        return t(($) => $.navigation.serviceDashboard);
      case 'mieszkaniec':
        return t(($) => $.navigation.residentDashboard);
      default:
        return t(($) => $.navigation.userDashboard);
    }
  };
  const dashboardButtonText = getDashboardButtonText();

  return (
    <header className="border-b bg-white">
      <div className="container mx-auto px-4 py-3 sm:py-4 lg:py-6">
        <div className="flex items-center justify-between gap-3 sm:hidden">
          <button
            type="button"
            onClick={onHomeClick}
            className="flex min-w-0 items-center gap-2 rounded-lg outline-none transition-opacity hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label={t(($) => $.navigation.home)}
          >
            <CityEmblem className="size-9 shrink-0" />
            <span className="truncate text-sm font-medium text-gray-700">
              {t(($) => $.navigation.city, { city: cityName })}
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher variant="compact" />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-lg"
                    className="size-10"
                    aria-label={t(($) => $.navigation.openMenu)}
                  />
                }
              >
                <Menu aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-max min-w-48">
                {isLoggedIn ? (
                  <>
                    <DropdownMenuItem onClick={onDashboardClick} className="min-h-10 px-3">
                      <LayoutDashboard aria-hidden="true" />
                      {dashboardButtonText}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={onLogoutClick}
                      className="min-h-10 px-3"
                    >
                      <LogOut aria-hidden="true" />
                      {t(($) => $.navigation.logout)}
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem onClick={onLoginClick} className="min-h-10 px-3">
                    <LogIn aria-hidden="true" />
                    {t(($) => $.navigation.login)}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="hidden items-center justify-between gap-4 sm:flex lg:hidden">
          <button
            type="button"
            onClick={onHomeClick}
            className="flex min-w-0 items-center gap-3 rounded-lg outline-none transition-opacity hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label={t(($) => $.navigation.home)}
          >
            <CityEmblem className="size-10 shrink-0" />
            <span className="truncate text-gray-700">
              {t(($) => $.navigation.city, { city: cityName })}
            </span>
          </button>

          <div className="flex shrink-0 items-center justify-end gap-2">
            <LanguageSwitcher variant="full" />
            {isLoggedIn ? (
              <>
                <Button variant="outline" onClick={onDashboardClick}>
                  {dashboardButtonText}
                </Button>
                <Button
                  variant="outline"
                  onClick={onLogoutClick}
                  className="border-destructive/30 text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <LogOut aria-hidden="true" />
                  {t(($) => $.navigation.logoutShort)}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={onLoginClick}>
                {t(($) => $.navigation.login)}
              </Button>
            )}
          </div>
        </div>

        <div className="hidden grid-cols-[1fr_auto_1fr] items-center gap-4 lg:grid">
          <button
            type="button"
            onClick={onHomeClick}
            className="w-fit rounded-lg text-left text-gray-700 outline-none transition-opacity hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t(($) => $.navigation.city, { city: cityName })}
          </button>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={onHomeClick}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              aria-label={t(($) => $.navigation.home)}
            >
              <CityEmblem className="size-12" />
            </button>
          </div>

          <div className="flex items-center justify-end gap-3">
            <LanguageSwitcher variant="full" />
            {isLoggedIn ? (
              <>
                <Button variant="outline" onClick={onDashboardClick}>
                  {dashboardButtonText}
                </Button>
                <Button
                  variant="outline"
                  onClick={onLogoutClick}
                  className="border-destructive/30 text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <LogOut aria-hidden="true" />
                  {t(($) => $.navigation.logout)}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={onLoginClick}>
                {t(($) => $.navigation.login)}
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
