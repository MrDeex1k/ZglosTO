import { findCityService, type CityService, type SupportedLocale } from '@zglosto/contracts';
import type { CSSProperties } from 'react';

import { whiteLabelConfig, whiteLabelView } from './white-label';

const serviceCatalog = whiteLabelView.services;

export const enabledServices = serviceCatalog.filter((service) => service.enabled);

export const assignableServices = enabledServices.filter(
  (service) => service.key !== whiteLabelConfig.routing.fallbackServiceKey,
);

function resolveService(value: string): CityService | null {
  return findCityService(serviceCatalog, value);
}

export function normalizeServiceKey(value: string): string {
  return resolveService(value)?.key ?? value;
}

export function isFallbackService(value: string): boolean {
  return normalizeServiceKey(value) === whiteLabelConfig.routing.fallbackServiceKey;
}

export function getFallbackServiceLabel(locale: SupportedLocale): string {
  return getServiceLabel(whiteLabelConfig.routing.fallbackServiceKey, locale);
}

export function getServiceLabel(value: string, locale: SupportedLocale): string {
  const service = resolveService(value);
  return service === null ? value : service.label[locale];
}

export function getServiceShortLabel(value: string, locale: SupportedLocale): string {
  const service = resolveService(value);
  return service === null ? value : service.shortLabel[locale];
}

export function getServiceBadgeStyle(value: string): CSSProperties {
  const color = resolveService(value)?.color ?? '#6B7280';
  return {
    backgroundColor: `color-mix(in srgb, ${color} 14%, white)`,
    color,
  };
}
