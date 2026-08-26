import { Stack } from 'expo-router/stack';
import { useTranslation } from 'react-i18next';

export default function SupportLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen name="contact" options={{ title: t(($) => $.mobile.contact.routeTitle) }} />
    </Stack>
  );
}
