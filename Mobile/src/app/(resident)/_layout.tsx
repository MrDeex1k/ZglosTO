import { Stack } from 'expo-router/stack';
import { useTranslation } from 'react-i18next';

export default function ResidentLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen
        name="(tabs)"
        options={{ headerShown: false, title: t(($) => $.mobile.resident.routeTitle) }}
      />
      <Stack.Screen
        name="resident/incidents/[id]"
        options={{ title: t(($) => $.mobile.incidentDetails.title) }}
      />
    </Stack>
  );
}
