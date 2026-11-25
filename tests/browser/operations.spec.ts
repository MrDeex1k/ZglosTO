import { expect, test } from '@playwright/test';

function session(role: 'admin' | 'sluzby' | 'mieszkaniec', serviceKey: string | null = null) {
  return {
    session: { id: 'operations-session', userId: 'operations-user' },
    user: {
      id: 'operations-user',
      email: 'operations@example.test',
      name: 'Testowy Operator',
      emailVerified: true,
      uprawnienia: role,
      serviceKey,
    },
  };
}

test('a signed-out operator gets a sign-in form without public navigation', async ({ page }) => {
  await page.route('**/api/auth/get-session', (route) => route.fulfill({ json: null }));
  await page.goto('/operacje');
  await expect(page.getByRole('heading', { name: 'Zaloguj się' })).toBeVisible();
  await expect(page.getByRole('button', { name: /zarejestruj|zgłoś incydent/i })).toHaveCount(0);
});

for (const role of ['mieszkaniec', 'sluzby'] as const) {
  test(`does not load an operations queue with role ${role} and no active assignment`, async ({
    page,
  }) => {
    await page.route('**/api/auth/get-session', (route) => route.fulfill({ json: session(role) }));
    const incidentRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/incydenty')) incidentRequests.push(request.url());
    });
    await page.goto('/operacje');
    await expect(
      page.getByRole('heading', { name: 'Brak dostępu do panelu operacyjnego' }),
    ).toBeVisible();
    expect(incidentRequests).toEqual([]);
  });
}

test('shows the administrator panel for an administrator', async ({ page }) => {
  await page.route('**/api/auth/get-session', (route) => route.fulfill({ json: session('admin') }));
  await page.route('**/api/admin/incydenty', (route) => route.fulfill({ json: [] }));
  await page.goto('/operacje');
  await expect(page.getByRole('heading', { name: 'Panel Administratorski' })).toBeVisible();
  await expect(page.getByText('Nadaj uprawnienia służb')).toBeVisible();
});

test('closes the service panel when the session loses its role', async ({ page }) => {
  let current = session('sluzby', 'roads');
  await page.clock.install();
  await page.route('**/api/auth/get-session', (route) => route.fulfill({ json: current }));
  await page.route('**/api/sluzby/incydenty', (route) => route.fulfill({ json: [] }));
  await page.goto('/operacje');
  await expect(page.getByRole('heading', { name: 'Panel Służby' })).toBeVisible();
  current = session('mieszkaniec');
  await page.clock.fastForward(16_000);
  await expect(
    page.getByRole('heading', { name: 'Brak dostępu do panelu operacyjnego' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Panel Służby' })).toHaveCount(0);
});
