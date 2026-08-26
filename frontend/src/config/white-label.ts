import {
  parsePublicWhiteLabelConfig,
  type LocalizedText,
  type PublicWhiteLabelConfig,
  type SupportedLocale,
} from '@zglosto/contracts';

import { createWhiteLabelView, localizeCityIdentity } from './white-label-view';

declare const WHITE_LABEL_CONFIG_BUILD: unknown;

export const whiteLabelConfig: PublicWhiteLabelConfig =
  parsePublicWhiteLabelConfig(WHITE_LABEL_CONFIG_BUILD);
export const whiteLabelView = createWhiteLabelView(whiteLabelConfig);

export function getCityIdentity(locale: SupportedLocale) {
  return localizeCityIdentity(whiteLabelView, locale);
}

export function getLocalizedText(text: LocalizedText, locale: SupportedLocale): string {
  return text[locale];
}

export function applyWhiteLabelDocumentConfig(locale: SupportedLocale): void {
  if (typeof document === 'undefined') return;

  const { branding, localContent } = whiteLabelConfig;
  const rootStyle = document.documentElement.style;

  rootStyle.setProperty('--brand-primary', branding.colors.primary);
  rootStyle.setProperty('--brand-secondary', branding.colors.secondary);
  rootStyle.setProperty('--brand-accent', branding.colors.accent);
  document.title = getLocalizedText(localContent.siteTitle, locale);

  const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (description !== null) {
    description.content = getLocalizedText(localContent.siteDescription, locale);
  }

  const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (favicon !== null) favicon.href = branding.faviconPath;
}
