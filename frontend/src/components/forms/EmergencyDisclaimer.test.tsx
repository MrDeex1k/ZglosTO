import { createI18n, type SupportedLocale } from '@zglosto/i18n';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, test } from 'vitest';

import { EmergencyDisclaimer } from './EmergencyDisclaimer';

async function renderDisclaimer(locale: SupportedLocale): Promise<string> {
  const i18n = await createI18n(locale);
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <EmergencyDisclaimer />
    </I18nextProvider>,
  );
}

describe('EmergencyDisclaimer', () => {
  test('renders the permanent Polish 112 notice without an interactive confirmation', async () => {
    const markup = await renderDisclaimer('pl-PL');

    expect(markup).toContain('role="note"');
    expect(markup).toContain(
      'ZgłosTO nie służy do obsługi sytuacji alarmowych. Jeśli występuje bezpośrednie zagrożenie życia, zdrowia, mienia lub bezpieczeństwa, zadzwoń pod numer 112.',
    );
    expect(markup).not.toMatch(/<(button|input|a)\b/);
  });

  test('renders the equivalent English 112 notice', async () => {
    const markup = await renderDisclaimer('en');

    expect(markup).toContain(
      'ZgłosTO is not intended for emergency response. If there is an immediate threat to life, health, property, or safety, call 112.',
    );
  });
});
