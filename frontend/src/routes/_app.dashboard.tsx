import { Outlet, createFileRoute } from '@tanstack/react-router';

import { requireAuthenticatedUser } from '../app/router-auth';

export const Route = createFileRoute('/_app/dashboard')({
  beforeLoad: async ({ context, location }) => ({
    authenticatedUser: await requireAuthenticatedUser(context.auth, location),
  }),
  loader: ({ context }) => ({
    viewer: context.authenticatedUser,
  }),
  component: Outlet,
});
