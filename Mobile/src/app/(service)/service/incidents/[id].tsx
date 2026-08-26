import { useLocalSearchParams } from 'expo-router';

import { ServiceIncidentDetailsScreen } from '@/screens/service-incident-details-screen';

export default function ServiceIncidentDetailsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ServiceIncidentDetailsScreen incidentId={id} />;
}
