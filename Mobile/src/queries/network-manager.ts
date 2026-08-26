import { addEventListener } from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

export function startNetworkManager(): () => void {
  onlineManager.setEventListener((setOnline) =>
    addEventListener((state) => setOnline(Boolean(state.isConnected))),
  );
  return () => onlineManager.setEventListener(() => () => undefined);
}

export function startFocusManager(): () => void {
  const onAppStateChange = (status: AppStateStatus) => {
    if (process.env.EXPO_OS !== 'web') focusManager.setFocused(status === 'active');
  };
  const subscription = AppState.addEventListener('change', onAppStateChange);
  return () => subscription.remove();
}
