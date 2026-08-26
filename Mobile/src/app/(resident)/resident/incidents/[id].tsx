import { useLocalSearchParams } from 'expo-router';

import { ResidentIncidentDetailsScreen } from '@/screens/resident-incident-details-screen';

export default function ResidentIncidentDetailsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ResidentIncidentDetailsScreen incidentId={id} />;
}
