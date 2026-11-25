import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const photo = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWPgqrjzH4QZYAwATqAJdcbiRDcAAAAASUVORK5CYII=',
  'base64',
);

test('submits a report with a photo and changes its status as the assigned service', async ({
  page,
}) => {
  const description = `[municipal] Uszkodzona nawierzchnia ${randomUUID()}`;
  await page.goto('/');
  await page.getByRole('button', { name: 'ZGŁOŚ INCYDENT' }).click();
  const form = page.getByRole('dialog', { name: 'Zgłoś nowy incydent' });
  await form.getByRole('combobox', { name: /Wybierz służbę/ }).click();
  await page.getByRole('option', { name: 'Zarząd Dróg' }).click();
  await form.getByLabel(/^Adres \*/).fill('Rynek 1');
  await form.getByLabel(/Opis zgłoszenia/).fill(description);
  await form.getByLabel(/Adres e-mail/).fill('flashwright.resident@example.com');
  await form.locator('input[type="file"]').setInputFiles({
    name: 'report.png',
    mimeType: 'image/png',
    buffer: photo,
  });
  await form.getByRole('button', { name: 'Wyślij zgłoszenie' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Zgłoszenie przyjęte');

  await page.goto('/dashboard/sluzby');
  await page.getByLabel(/Adres e-mail/).fill('phase0.service@example.com');
  await page.getByLabel(/^Hasło/).fill('Phase0!Pass123');
  await page.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await expect(page).toHaveURL('/dashboard/sluzby');

  const details = page.getByRole('button', { name: `Otwórz szczegóły zgłoszenia ${description}` });
  await details.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Status' }).click();
  await page.getByRole('option', { name: 'W TRAKCIE NAPRAWY' }).click();
  await dialog.getByRole('button', { name: 'Zapisz zmiany' }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await details.click();
  await expect(dialog.getByRole('combobox', { name: 'Status' })).toContainText('W TRAKCIE NAPRAWY');
});
