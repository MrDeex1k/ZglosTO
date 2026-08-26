import { useLocalSearchParams } from 'expo-router';

import { parseIncidentId, parseIncidentLinkTarget } from '@/linking/deep-link-intent';
import { DeepLinkIncidentScreen } from '@/screens/deep-link-incident-screen';

export default function OpenIncidentLinkRoute() {
  const { id, target } = useLocalSearchParams<{
    id?: string | string[];
    target?: string | string[];
  }>();
  return (
    <DeepLinkIncidentScreen
      incidentId={parseIncidentId(id)}
      target={parseIncidentLinkTarget(target)}
    />
  );
}
