import { beforeEach, test, type Device } from '@e2e-dev/mobile';
import { credentials, expect, type Screen } from 'e2e';

const expoURL =
  process.env.EXPO_DEV_CLIENT_URL ??
  'exp+zglosto://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081';
const publicLink = 'zglosto://open/incidents/00000000-0000-4000-8000-000000000076?target=public';
const publicIncident = /Uszkodzony znak przy przejściu dla pieszych został wymieniony/;
const serviceHeading = /^(Panel służby|Service dashboard) — Zarząd Dróg Miejskich$/;
const adminHeading = /^(Panel Administratora niedostępny|Administrator Dashboard unavailable)$/;
const residentHeading = /^(Moje zgłoszenia|My reports)$/;
const reportHeading = /^(Szczegóły zgłoszenia|Report details)$/;
const publicFeed = 'public-incidents-ready';
const allowExternalLink = /^(Open|Otwórz)$/;
const declineSavedPassword = /^(Nie teraz|Not Now)$/;
const openDashboard = /^(Otwórz panel|Open dashboard)$/;
const roleHeadings = { resident: residentHeading, service: serviceHeading, admin: adminHeading };

async function openPublicReport(device: Device, screen: Screen) {
  await device.openLink(publicLink);
  const allowLink = screen.getByRole('button', { name: allowExternalLink });
  if (await allowLink.isVisible()) await allowLink.tap();
}

async function logoutAndCheckPublicFeed(screen: Screen) {
  const signOut = screen.getByText(/^(Wyloguj się|Sign out)$/i);
  await screen.scrollUntilVisible(signOut, { direction: 'down' });
  await signOut.tap();
  await expect(screen.getByText(publicIncident)).toBeVisible({ timeout: 30_000 });
}

async function fillLoginField(fill: () => Promise<unknown>) {
  try {
    await fill();
  } catch (error: unknown) {
    if (
      !(error instanceof Error) ||
      !/text entry read-back did not match|no text input found at the provided coordinates/.test(
        error.message,
      )
    ) {
      throw error;
    }
    await fill();
  }
}

async function logIn(screen: Screen, device: Device, role: 'resident' | 'service' | 'admin') {
  const account = credentials.user(role);
  const email = screen.getByTestId('login-email');
  const password = screen.getByTestId('login-password');
  const ios = process.env.AGENT_DEVICE_PLATFORM === 'ios';

  await screen.getByText(/^(Zaloguj się|Sign in)$/i).tap();
  await expect(email).toBeVisible();
  await fillLoginField(() => email.fill(account.username));
  if (ios) await email.press('Enter');
  await fillLoginField(() => password.fill(account.password));
  if (ios) {
    // Submit through the keyboard to avoid moving form controls during keyboard animations.
    await password.press('Enter');
  } else {
    await screen.getByTestId('login-submit').tap();
    await device.dismissKeyboard();
  }
  if (ios) {
    const savePassword = screen.getByText(declineSavedPassword).first();
    // The system sheet may appear after the account screen becomes visible.
    const shouldDismiss = await savePassword.waitFor({ timeout: 8_000 }).then(
      () => true,
      () => false,
    );
    if (shouldDismiss) await savePassword.tap();
  }
  const signedIn = screen.getByText(roleHeadings[role]).first();
  await expect(signedIn).toBeVisible({ timeout: 30_000 });
}

beforeEach(async ({ app, device, screen }) => {
  await app.clearState();
  await device.openLink(expoURL);
  const debugLauncher = screen.getByText('Development Build', { exact: true });
  const allowLink = screen.getByText(allowExternalLink);
  const continueButton = screen.getByText('Continue', { exact: true });
  const closeButton = screen.getByText('Close', { exact: true });
  const dismissPassword = screen.getByText(declineSavedPassword).first();
  const nearbyPermission = screen.getByTestId(
    'com.android.permissioncontroller:id/permission_allow_button',
  );
  const buttonPrompt = nearbyPermission
    .or(allowLink)
    .or(continueButton)
    .or(closeButton)
    .or(dismissPassword);
  const admin = screen.getByText(adminHeading).first();
  const signedIn = admin
    .or(screen.getByText(serviceHeading).first())
    .or(screen.getByText(residentHeading).first());
  const report = screen.getByText(reportHeading).first();
  const feed = screen.getByTestId(publicFeed);
  const appScreen = feed.or(report).or(signedIn);
  const advanceStartup = async () => {
    await expect(buttonPrompt.or(debugLauncher).or(appScreen).first()).toBeVisible({
      timeout: 30_000,
    });
    if (await buttonPrompt.first().isVisible()) {
      await buttonPrompt.first().tap();
    } else if (await debugLauncher.isVisible()) {
      await device.openLink(expoURL);
    } else {
      return false;
    }
    return true;
  };
  for (let prompt = 0; prompt < 6; prompt += 1) {
    // Prompts arrive one at a time and can obscure the application underneath.
    // oxlint-disable-next-line no-await-in-loop
    if (!(await advanceStartup())) break;
  }

  if (await report.isVisible()) await app.back();
  const dashboardLink = screen.getByRole('button', { name: openDashboard });
  if (await dashboardLink.isVisible()) {
    await dashboardLink.tap();
    await expect(signedIn.first()).toBeVisible();
  }
  if (await admin.isVisible()) {
    await screen.getByTestId('admin-mobile-sign-out').tap();
  } else if (
    (await screen.getByText(serviceHeading).first().isVisible()) ||
    (await screen.getByText(residentHeading).first().isVisible())
  ) {
    await logoutAndCheckPublicFeed(screen);
  }

  await expect(feed).toBeVisible({ timeout: 30_000 });
  await expect(screen.getByText(publicIncident)).toBeVisible();
});

test('opens the public report and shows the resident’s own reports after sign-in', async ({
  app,
  device,
  screen,
}) => {
  await openPublicReport(device, screen);
  await expect(screen.getByText(reportHeading).first()).toBeVisible();
  await expect(screen.getByText('ul. Lipowa 24', { exact: true }).first()).toBeVisible();
  await app.back();
  await logIn(screen, device, 'resident');
  await expect(screen.getByText(residentHeading).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(screen.getByText(/^(Witaj|Hello), Anna Kowalska$/).first()).toBeVisible();
  await expect(
    screen.getByText(/Głęboki ubytek w jezdni stwarza zagrożenie dla rowerzystów i kierowców/),
  ).toBeVisible();
  await logoutAndCheckPublicFeed(screen);
});

test('shows the assigned service queue and retains its boundary at a public link', async ({
  device,
  screen,
}) => {
  await logIn(screen, device, 'service');
  const heading = screen.getByText(serviceHeading).first();
  await expect(heading).toBeVisible({ timeout: 30_000 });
  await expect(screen.getByText(/^(Zarząd Dróg|Road Authority)$/)).toBeVisible();
  const incident = screen.getByText(
    /Zwężenie jezdni utrudnia przejazd autobusom komunikacji miejskiej/,
  );
  await screen.scrollUntilVisible(incident, { direction: 'down' });
  await expect(incident).toBeVisible();
  await expect(screen.getByTestId(publicFeed)).not.toBeVisible();
  await openPublicReport(device, screen);
  await expect(heading).toBeVisible();
  await logoutAndCheckPublicFeed(screen);
});

test('blocks the administrator panel on mobile, including at a public link', async ({
  device,
  screen,
}) => {
  await logIn(screen, device, 'admin');
  const heading = screen.getByText(adminHeading).first();
  await expect(heading).toBeVisible({ timeout: 30_000 });
  await expect(screen.getByText(/^(Wymagany komputer|Computer required)$/)).toBeVisible();
  await expect(screen.getByTestId(publicFeed)).not.toBeVisible();
  await expect(screen.getByText(serviceHeading).first()).not.toBeVisible();
  await expect(screen.getByText(/Otwórz panel webowy|Open web dashboard/)).not.toBeVisible();
  await openPublicReport(device, screen);
  await expect(heading).toBeVisible();
  await screen.getByTestId('admin-mobile-sign-out').tap();
  await expect(screen.getByText(publicIncident)).toBeVisible({ timeout: 30_000 });
});
