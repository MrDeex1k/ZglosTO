import { normalizeSupportedLocale } from '@zglosto/i18n';
import { useTranslation } from 'react-i18next';

import { changeLocale } from '../i18n';
import { resolveI18nLocale } from '../lib/locale';

interface LanguageSwitcherProps {
  variant: 'compact' | 'full';
}

export function LanguageSwitcher({ variant }: Readonly<LanguageSwitcherProps>) {
  const { t, i18n } = useTranslation();
  const isCompact = variant === 'compact';

  const handleLanguageChange = (value: string) => {
    const locale = normalizeSupportedLocale(value);
    if (locale !== null) void changeLocale(locale);
  };

  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <span className="sr-only">{t(($) => $.common.language)}</span>
      <select
        aria-label={t(($) => $.common.language)}
        value={resolveI18nLocale(i18n)}
        onChange={(event) => handleLanguageChange(event.target.value)}
        className={
          isCompact
            ? 'h-10 rounded-lg border border-gray-300 bg-white px-2 text-sm font-medium'
            : 'rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm'
        }
      >
        <option value="pl-PL">{isCompact ? 'PL' : t(($) => $.common.polish)}</option>
        <option value="en">{isCompact ? 'EN' : t(($) => $.common.english)}</option>
      </select>
    </label>
  );
}
