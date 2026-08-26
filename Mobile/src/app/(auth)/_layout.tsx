import { Stack } from 'expo-router/stack';
import { useTranslation } from 'react-i18next';

export default function AuthLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen name="login" options={{ title: t(($) => $.mobile.auth.title) }} />
      <Stack.Screen
        name="register"
        options={{ title: t(($) => $.mobile.registration.routeTitle) }}
      />
    </Stack>
  );
}
