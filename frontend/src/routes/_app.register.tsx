import { createFileRoute } from '@tanstack/react-router';

import { RegisterRouteView } from '../app/route-views';

export const Route = createFileRoute('/_app/register')({
  head: () => ({
    meta: [{ title: 'Rejestracja | ZglosTO' }],
  }),
  component: RegisterRouteView,
});
