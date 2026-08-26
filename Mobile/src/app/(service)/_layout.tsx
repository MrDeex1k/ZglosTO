import { Stack } from 'expo-router/stack';
import { useTranslation } from 'react-i18next';

export default function ServiceLayout() {
  const { t } = useTranslation();

  return (
    <Stack>
      <Stack.Screen name="service" options={{ title: t(($) => $.mobile.service.routeTitle) }} />
    </Stack>
  );
}
