import { Outlet, createFileRoute } from '@tanstack/react-router';

import { AppRouteStateProvider } from '../app/app-route-state';

export const Route = createFileRoute('/_app')({
  ssr: false,
  component: AppLayout,
});

function AppLayout() {
  return (
    <AppRouteStateProvider>
      <Outlet />
    </AppRouteStateProvider>
  );
}
