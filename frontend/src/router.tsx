import { createRouter } from '@tanstack/react-router';

import { routerAuth } from './app/router-auth';
import { createAppQueryClient } from './lib/query-client';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  const queryClient = createAppQueryClient();

  return createRouter({
    routeTree,
    context: {
      auth: routerAuth,
      queryClient,
    },
    scrollRestoration: true,
  });
}
