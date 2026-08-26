import { QueryClient } from '@tanstack/react-query';

import { isRetryableApiError } from '@/api/errors';

export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && isRetryableApiError(error);
}

export function createMobileQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // MVP nie ma kolejki offline. Mutacja ma zakończyć się błędem zamiast
      // pozostać wstrzymana i wykonać się bez kolejnej decyzji użytkownika.
      mutations: { networkMode: 'always', retry: false },
      queries: {
        gcTime: 15 * 60 * 1000,
        refetchOnReconnect: true,
        retry: shouldRetry,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        staleTime: 60 * 1000,
      },
    },
  });
}

export function clearPrivateQueries(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: ['private'] });
}
