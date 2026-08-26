import { createFileRoute } from '@tanstack/react-router';

import { parseLocalRedirect } from '../app/route-access';
import { LoginRouteView } from '../app/route-views';

export const Route = createFileRoute('/_app/login')({
  validateSearch: (search: Record<string, unknown>) => {
    const redirectPath = parseLocalRedirect(search.redirect);
    return redirectPath === null ? {} : { redirect: redirectPath };
  },
  loaderDeps: ({ search }) => ({
    redirectPath: parseLocalRedirect(search.redirect),
  }),
  loader: ({ deps }) => deps,
  head: () => ({
    meta: [{ title: 'Logowanie | ZglosTO' }],
  }),
  component: LoginRoute,
});

function LoginRoute() {
  const { redirectPath } = Route.useLoaderData();
  return <LoginRouteView redirectPath={redirectPath} />;
}
