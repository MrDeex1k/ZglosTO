import { expect, test } from '@playwright/test';
import type { CurrentResolvedIncidentDto } from '../../packages/contracts/src/incidents.ts';

const feed = '**/api/mieszkaniec/incydenty/glowna';
const resolvedIncident: CurrentResolvedIncidentDto = {
  id_zgloszenia: 'cb453cdd-8389-42da-8e49-b1281edd0aa4',
  opis_zgloszenia: 'Naprawiono nawierzchnię',
  adres_zgloszenia: 'Rynek 1',
  latitude: null,
  longitude: null,
  typ_sluzby: 'roads',
  status_incydentu: 'resolved',
  zdjecie_incydentu_rozwiazanego: null,
  data_godzina_zgloszenia: '20.11.2026 10:00',
  data_godzina_rozwiazania: '21.11.2026 12:00',
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/get-session', (route) => route.fulfill({ json: null }));
});

test('opens the details of a resolved incident', async ({ page }) => {
  await page.route(feed, (route) => route.fulfill({ json: [resolvedIncident] }));
  await page.goto('/');
  await page
    .getByRole('button', {
      name: `Otwórz szczegóły zgłoszenia ${resolvedIncident.opis_zgloszenia}`,
    })
    .click();
  await expect(page.getByRole('dialog')).toContainText(resolvedIncident.adres_zgloszenia);
});

test('recovers the public feed after the API becomes available', async ({ page }) => {
  let feedAvailable = false;
  await page.route(feed, (route) =>
    feedAvailable
      ? route.fulfill({ json: [] })
      : route.fulfill({ status: 503, json: { error: 'Unavailable' } }),
  );

  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText(
    'Nie udało się załadować rozwiązanych zgłoszeń.',
  );
  await expect(page.getByRole('button', { name: 'ZGŁOŚ INCYDENT' })).toBeVisible();
  feedAvailable = true;
  await page.getByRole('button', { name: 'Spróbuj ponownie' }).click();
  await expect(page.getByText('Brak rozwiązanych zgłoszeń')).toBeVisible();
});

test('remembers the selected language after a reload', async ({ page }) => {
  await page.route(feed, (route) => route.fulfill({ json: [] }));
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Język' }).selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('en');
});
