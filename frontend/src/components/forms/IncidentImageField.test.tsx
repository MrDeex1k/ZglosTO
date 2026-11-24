import { createI18n } from '@zglosto/i18n';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { expect, test, vi } from 'vitest';

import { IncidentImageField } from './IncidentImageField';

test('renders a tabbable native photo picker with an English label and visible focus style', async () => {
  const i18n = await createI18n('en');
  const markup = renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <IncidentImageField value={null} errors={[]} onChange={vi.fn()} />
    </I18nextProvider>,
  );

  expect(markup).toMatch(/<input id="image" type="file"[^>]*class="peer sr-only"/);
  expect(markup).not.toMatch(/<input[^>]+(?:tabindex="-1"|\s(?:disabled|hidden)(?:=|\s|>))/i);
  expect(markup).toMatch(/<label[^>]*for="image"[^>]*>Photo \(optional\)<\/label>/);
  expect(markup).toContain('peer-focus-visible:ring-2');
  expect(markup).toContain('Choose photo');
});
