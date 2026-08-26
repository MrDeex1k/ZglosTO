import { useLocalSearchParams } from 'expo-router';

import { IncidentDetailsScreen } from '@/screens/incident-details-screen';

export default function IncidentDetailsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <IncidentDetailsScreen incidentId={id} />;
}
