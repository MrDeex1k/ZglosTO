import { useNetInfo } from '@react-native-community/netinfo';

import { type NetworkAvailability, networkAvailabilityFromState } from './network-availability';

export function useNetworkAvailability(): NetworkAvailability {
  return networkAvailabilityFromState(useNetInfo());
}
