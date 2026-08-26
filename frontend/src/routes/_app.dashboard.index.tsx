import { createFileRoute, redirect } from '@tanstack/react-router';
import { dashboardPathForUser } from '../app/route-access';

export const Route = createFileRoute('/_app/dashboard/')({
  beforeLoad: ({ context }) => {
    throw redirect({
      to: dashboardPathForUser(context.authenticatedUser),
      replace: true,
    });
  },
});
