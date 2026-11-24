import { expect, test } from '@playwright/test';

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
