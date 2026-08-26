import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';

import appCss from '../App.css?url';
import type { AppRouterContext } from '../app/router-auth';
import { i18n } from '../i18n';

export const Route = createRootRouteWithContext<AppRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      {
        name: 'description',
        content: 'Serwis ZglosTO - Aplikacja do zgłaszania incydentów miejskich',
      },
      {
        name: 'keywords',
        content: 'ZglosTO, incydenty, miejskie, serwis, zgłaszanie, problemy, miasto',
      },
      { name: 'author', content: 'Jakub Batycki, Michał Kaszowski, Valeria Metelska' },
      { name: 'robots', content: 'index, follow' },
      { name: 'googlebot', content: 'index, follow' },
      { name: 'google', content: 'notranslate' },
      { title: 'ZglosTO' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/assets/favicon.svg' },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <Outlet />
        </I18nextProvider>
      </QueryClientProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
