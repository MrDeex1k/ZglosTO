import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { expect, test, type Page } from '@playwright/test';
import type { CurrentCreateIncidentResponse } from '../../packages/contracts/src/incidents.ts';

const reportPath = '/api/mieszkaniec/incydenty';
const description = 'Uszkodzona nawierzchnia';
const email = 'resident@example.test';
const address = 'Rynek 1';
const uploadId = '16d378dd-b0a0-4011-b30a-4d6d0b247e8d';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==',
  'base64',
);

function response(classification: 'municipal' | 'emergency'): CurrentCreateIncidentResponse {
  return {
    success: true,
    classification: {
      classification,
      serviceKey: 'roads',
      modelAvailable: true,
      source: 'model',
      reason: null,
    },
    incydent: {
      id_zgloszenia: '3a919acc-decf-4cf3-ad84-fa4269096f59',
      data_zgloszenia: '2026-11-24',
      godzina_zgloszenia: '12:00',
      opis_zgloszenia: description,
      mail_zglaszajacego: email,
      reporter_user_id: null,
      adres_zgloszenia: address,
      latitude: null,
      longitude: null,
      zdjecie_incydentu_zglaszanego: null,
      zdjecie_incydentu_rozwiazanego: null,
      sprawdzenie_incydentu: false,
      status_incydentu: 'reported',
      typ_sluzby: 'roads',
      llm_odpowiedz: null,
      llm_classification: classification,
      llm_model_available: true,
      llm_source: 'model',
      llm_reason: null,
      data_rozwiazania: null,
      godzina_rozwiazania: null,
    },
  };
}

async function openReportForm(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'ZGŁOŚ INCYDENT' }).click();
  const form = page.getByRole('dialog', { name: 'Zgłoś nowy incydent' });
  await form.getByRole('combobox', { name: /Wybierz służbę/ }).click();
  await page.getByRole('option', { name: 'Zarząd Dróg' }).click();
  await form.getByLabel(/Adres/).fill(address);
  await form.getByLabel(/Opis zgłoszenia/).fill(description);
  await form.getByLabel(/Email/).fill(email);
  return form;
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/get-session', (route) => route.fulfill({ json: null }));
  await page.route(`**${reportPath}/glowna`, (route) => route.fulfill({ json: [] }));
});

test('submits a report without a photo', async ({ page }) => {
  await page.route(`**${reportPath}`, (route) =>
    route.fulfill({ status: 201, json: response('municipal') }),
  );
  const form = await openReportForm(page);
  const request = page.waitForRequest(
    (item) => item.method() === 'POST' && item.url().endsWith(reportPath),
  );
  await form.getByRole('button', { name: 'Wyślij zgłoszenie' }).click();

  expect((await request).postDataJSON()).toMatchObject({
    adres_zgloszenia: address,
    opis_zgloszenia: description,
    mail_zglaszajacego: email,
    typ_sluzby: 'roads',
    zdjecie_incydentu_zglaszanego_upload_id: null,
  });
  await expect(page.getByRole('alertdialog')).toContainText('Zgłoszenie przyjęte');
});

test('uploads the photo before submitting and shows the 112 notice for an emergency', async ({
  page,
}) => {
  const form = await openReportForm(page);
  let uploaded: Buffer | null = null;
  const cors = {
    'Access-Control-Allow-Origin': new URL(page.url()).origin,
    'Access-Control-Allow-Methods': 'PUT',
    'Access-Control-Allow-Headers': 'content-type',
  };
  // WebKit's intercepted requests omit File bodies. Inspect the bytes at the receiver.
  const storage = createServer((request, result) => {
    if (request.method === 'OPTIONS') {
      result.writeHead(204, cors).end();
      return;
    }
    if (request.method !== 'PUT' || request.url !== '/report.png') {
      result.writeHead(404, cors).end();
      return;
    }
    const chunks: Buffer[] = [];
    request.on('data', (buffer: Buffer) => chunks.push(buffer));
    request.on('end', () => {
      uploaded = Buffer.concat(chunks);
      result.writeHead(204, cors).end();
    });
  });
  storage.listen(0, '127.0.0.1');
  await once(storage, 'listening');
  try {
    const endpoint = storage.address();
    if (endpoint === null || typeof endpoint === 'string') throw new Error('Expected a TCP port');
    await page.route('**/api/mieszkaniec/obrazy/uploads', async (route) => {
      expect(route.request().postDataJSON()).toMatchObject({
        mimeType: 'image/png',
        sizeBytes: png.byteLength,
        checksumSha256: createHash('sha256').update(png).digest('hex'),
      });
      await route.fulfill({
        status: 201,
        json: {
          uploadId,
          uploadUrl: `http://127.0.0.1:${endpoint.port}/report.png`,
          method: 'PUT',
          headers: { 'content-type': 'image/png' },
          expiresAt: '2030-01-01T00:00:00.000Z',
        },
      });
    });
    await page.route(`**${reportPath}`, async (route) => {
      expect(uploaded).toEqual(png);
      expect(route.request().postDataJSON()).toMatchObject({
        zdjecie_incydentu_zglaszanego_upload_id: uploadId,
      });
      await route.fulfill({ status: 201, json: response('emergency') });
    });
    await form.locator('input[type="file"]').setInputFiles({
      name: 'report.png',
      mimeType: 'image/png',
      buffer: png,
    });
    await form.getByRole('button', { name: 'Wyślij zgłoszenie' }).click();
    await expect(page.getByRole('alertdialog')).toContainText(
      'Zgłoszenie przyjęte — zadzwoń na 112',
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      storage.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});

test('shows an error when report submission fails', async ({ page }) => {
  await page.route(`**${reportPath}`, (route) =>
    route.fulfill({ status: 503, json: { error: 'Unavailable' } }),
  );
  const form = await openReportForm(page);
  await form.getByRole('button', { name: 'Wyślij zgłoszenie' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Błąd wysyłania');
});
