import type { CityService, PublicWhiteLabelConfig, SupportedLocale } from '@zglosto/contracts';

export interface LocalizedCityIdentity {
  key: string;
  displayName: string;
  logoPath: string;
  emblemAlt: string;
}

export interface WhiteLabelView {
  configVersion: string;
  city: PublicWhiteLabelConfig['city'];
  branding: PublicWhiteLabelConfig['branding'];
  services: readonly CityService[];
}

export function createWhiteLabelView(config: PublicWhiteLabelConfig): WhiteLabelView {
  return {
    configVersion: config.configVersion,
    city: config.city,
    branding: config.branding,
    services: [...config.services].sort((left, right) => left.sortOrder - right.sortOrder),
  };
}

export function localizeCityIdentity(
  view: WhiteLabelView,
  locale: SupportedLocale,
): LocalizedCityIdentity {
  return {
    key: view.city.key,
    displayName: view.city.displayName[locale],
    logoPath: view.branding.logoPath,
    emblemAlt: view.branding.emblemAlt[locale],
  };
}
