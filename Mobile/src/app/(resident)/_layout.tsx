import { Stack } from 'expo-router/stack';
import { useTranslation } from 'react-i18next';

export default function ResidentLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen name="resident" options={{ title: t(($) => $.mobile.resident.routeTitle) }} />
      <Stack.Screen name="account" options={{ title: t(($) => $.mobile.account.routeTitle) }} />
    </Stack>
  );
}
