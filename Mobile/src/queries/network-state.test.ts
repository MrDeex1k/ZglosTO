import { describe, expect, test } from 'vitest';

import { networkAvailabilityFromState } from './network-availability';

describe('network availability', () => {
  test('treats a disconnected transport as offline', () => {
    expect(networkAvailabilityFromState({ isConnected: false, isInternetReachable: null })).toBe(
      'offline',
    );
  });

  test('treats an unreachable internet connection as offline', () => {
    expect(networkAvailabilityFromState({ isConnected: true, isInternetReachable: false })).toBe(
      'offline',
    );
  });

  test('does not show an offline state before NetInfo has an answer', () => {
    expect(networkAvailabilityFromState({ isConnected: null, isInternetReachable: null })).toBe(
      'unknown',
    );
  });

  test('accepts a connected transport while reachability is being resolved', () => {
    expect(networkAvailabilityFromState({ isConnected: true, isInternetReachable: null })).toBe(
      'online',
    );
  });
});
