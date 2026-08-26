export type NetworkAvailability = 'offline' | 'online' | 'unknown';

export function networkAvailabilityFromState(state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}): NetworkAvailability {
  if (state.isConnected === false || state.isInternetReachable === false) return 'offline';
  if (state.isConnected === true) return 'online';
  return 'unknown';
}
