import { expect, test } from '@playwright/test';
import type {
  CurrentDatabaseIncidentDto,
  ServiceIncidentListItemDto,
} from '../../packages/contracts/src/incidents.ts';

const session = '**/api/auth/get-session';

for (const role of ['admin', 'mieszkaniec', 'sluzby'] as const) {
  test(`redirects a visitor from the ${role} dashboard to login`, async ({ page }) => {
    await page.route(session, (route) => route.fulfill({ json: null }));
    await page.goto(`/dashboard/${role}`);
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === '/login' && url.searchParams.get('redirect') === `/dashboard/${role}`,
    );
    await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible();
  });
}

test('redirects a resident from the service dashboard to their own dashboard', async ({ page }) => {
  await page.route(session, (route) =>
    route.fulfill({
      json: {
        session: { id: 'test-session', userId: 'test-resident' },
        user: {
          id: 'test-resident',
          email: 'resident@example.test',
          name: 'Testowy Mieszkaniec',
          emailVerified: true,
          uprawnienia: 'mieszkaniec',
          serviceKey: null,
        },
      },
    }),
  );
  await page.route('**/api/mieszkaniec/incydenty', (route) => route.fulfill({ json: [] }));
  await page.goto('/dashboard/sluzby');
  await expect(page).toHaveURL('/dashboard/mieszkaniec');
  await expect(page.getByRole('heading', { name: 'Panel Mieszkańca' })).toBeVisible();
});

test('keeps service edits open and retries against the refreshed incident revision', async ({
  page,
}) => {
  const incidentFields = {
    id_zgloszenia: 'cb453cdd-8389-42da-8e49-b1281edd0aa4',
    opis_zgloszenia: 'Uszkodzona nawierzchnia',
    adres_zgloszenia: 'Rynek 1',
    mail_zglaszajacego: 'resident@example.test',
    latitude: null,
    longitude: null,
    typ_sluzby: 'roads',
    zdjecie_incydentu_zglaszanego: null,
    zdjecie_incydentu_rozwiazanego: null,
    llm_odpowiedz: null,
    llm_classification: 'municipal',
    llm_model_available: true,
    llm_source: 'model',
    llm_reason: null,
  } as const;
  const photo = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==',
    'base64',
  );
  const storedResolution = {
    id: 'stored-resolution',
    kind: 'resolution',
    status: 'pending',
    original: {
      objectKey: 'stored.png',
      mimeType: 'image/png',
      sizeBytes: photo.length,
      checksumSha256: 'fixture',
    },
    processed: null,
    width: null,
    height: null,
    failureCode: null,
    url: '/test-resolution.png',
  } as const;
  const incident: ServiceIncidentListItemDto = {
    ...incidentFields,
    revision: 7,
    status_incydentu: 'reported',
    sprawdzenie_incydentu: false,
    data_godzina_zgloszenia: '20.11.2026 10:00',
    data_godzina_rozwiazania: null,
  };
  const saved: CurrentDatabaseIncidentDto = {
    ...incidentFields,
    status_incydentu: 'in_progress',
    sprawdzenie_incydentu: true,
    reporter_user_id: null,
    zdjecie_incydentu_rozwiazanego: storedResolution,
    data_zgloszenia: '2026-11-20',
    godzina_zgloszenia: '10:00:00',
    data_rozwiazania: null,
    godzina_rozwiazania: null,
  };

  await page.route(session, (route) =>
    route.fulfill({
      json: {
        session: { id: 'test-session', userId: 'test-service' },
        user: {
          id: 'test-service',
          email: 'service@example.test',
          name: 'Testowa Służba',
          emailVerified: true,
          uprawnienia: 'sluzby',
          serviceKey: 'roads',
        },
      },
    }),
  );

  await page.route('**/test-resolution.png', (route) =>
    route.fulfill({ body: photo, contentType: 'image/png' }),
  );

  let currentIncident = incident;
  let canRefresh = true;
  const writes: Array<{ revision: string | null; body: unknown }> = [];
  await page.route('**/api/sluzby/incydenty', (route) =>
    canRefresh
      ? route.fulfill({ json: [currentIncident] })
      : route.fulfill({ status: 503, json: { error: 'Unavailable' } }),
  );
  await page.route('**/api/sluzby/incydenty/*/sprawdzenie', async (route) => {
    writes.push({
      revision: route.request().headers()['if-match'] ?? null,
      body: route.request().postDataJSON(),
    });
    if (writes.length === 1) {
      currentIncident = {
        ...incident,
        status_incydentu: 'in_progress',
        zdjecie_incydentu_rozwiazanego: storedResolution,
        revision: 8,
      };
      canRefresh = false;
      await route.fulfill({ status: 409, json: { error: 'Conflict' } });
      return;
    }
    currentIncident = { ...currentIncident, sprawdzenie_incydentu: true, revision: 9 };
    await route.fulfill({ json: { success: true, incydent: saved, revision: 9 } });
  });

  await page.goto('/dashboard/sluzby');
  await page
    .getByRole('button', { name: 'Otwórz szczegóły zgłoszenia Uszkodzona nawierzchnia' })
    .click();

  const dialog = page.getByRole('dialog');
  const save = dialog.getByRole('button', { name: 'Zapisz zmiany' });
  const reload = dialog.getByRole('button', { name: 'Pobierz aktualne dane' });
  await dialog.getByRole('button', { name: 'TAK', exact: true }).click();
  await save.click();
  await expect(dialog.getByRole('alert')).toContainText('Zgłoszenie zmieniło się w trakcie edycji');
  await expect(save).toBeDisabled();
  await reload.click();
  await expect(dialog.getByText('Nie udało się pobrać aktualnej listy zgłoszeń.')).toBeVisible();
  await expect(save).toBeDisabled();

  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'draft.png',
    mimeType: 'image/png',
    buffer: photo,
  });
  canRefresh = true;
  await reload.click();
  await expect(dialog.getByRole('status')).toContainText('Stan w systemie');
  await expect(dialog.getByRole('combobox', { name: 'Status' })).toContainText('W TRAKCIE NAPRAWY');
  const savedPhoto = dialog.getByRole('img', { name: 'Zdjęcie po rozwiązaniu' });
  const draftPhoto = dialog.getByRole('img', { name: 'Podgląd zdjęcia po naprawie: draft.png' });
  await expect(savedPhoto).toBeVisible();
  await expect(draftPhoto).toBeVisible();
  await dialog.getByRole('button', { name: 'Usuń wybrane zdjęcie' }).click();
  await expect(draftPhoto).not.toBeVisible();
  await expect(savedPhoto).toBeVisible();
  await save.click();
  await expect(dialog).not.toBeVisible();
  expect(writes).toEqual([
    { revision: '"incident-7"', body: { sprawdzenie_incydentu: true } },
    { revision: '"incident-8"', body: { sprawdzenie_incydentu: true } },
  ]);
});
