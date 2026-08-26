import { Stack } from 'expo-router/stack';
import { useTranslation } from 'react-i18next';

export default function SettingsLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen
        name="language"
        options={{ title: t(($) => $.mobile.languageSettings.routeTitle) }}
      />
    </Stack>
  );
}
