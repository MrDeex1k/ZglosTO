import { DEPLOYMENT_TIMEZONE, formatDateTime } from '@zglosto/i18n';

import { getCurrentLocale } from '../i18n';

export function formatPolishDate(dateString: string): string {
  return formatDateTime(dateString, getCurrentLocale(), DEPLOYMENT_TIMEZONE);
}
