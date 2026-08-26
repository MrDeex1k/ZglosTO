import type { PublicWhiteLabelConfig } from '@zglosto/contracts';
import { useQuery } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, use, useState } from 'react';

import { createApiClient } from '@/api/client';
import { ApiError } from '@/api/errors';
import { loadPublicConfig, type PublicConfigLoadResult } from '@/api/white-label';
import { logger } from '@/observability/logger';
import { queryKeys } from '@/queries/query-keys';
import { createPublicConfigCache } from '@/storage/public-config-cache';

import { readMobileEnvironment, type MobileEnvironment } from './env';

export type RuntimeConfigState =
  | { error: Error; retry: (() => void) | null; status: 'error' }
  | { status: 'loading' }
  | {
      config: PublicWhiteLabelConfig;
      environment: MobileEnvironment;
      isStale: boolean;
      response: PublicConfigLoadResult['response'];
      source: PublicConfigLoadResult['source'];
      status: 'ready';
    };

const RuntimeConfigContext = createContext<RuntimeConfigState>({ status: 'loading' });

function readEnvironmentResult(): { environment: MobileEnvironment } | { error: Error } {
  try {
    return { environment: readMobileEnvironment() };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error('Invalid mobile environment.') };
  }
}

export function RuntimeConfigProvider({ children }: PropsWithChildren) {
  const [resources] = useState(() => {
    const environmentResult = readEnvironmentResult();
    const environment = 'environment' in environmentResult ? environmentResult.environment : null;
    return {
      cache: createPublicConfigCache(),
      client: environment === null ? null : createApiClient({ origin: environment.apiOrigin }),
      environment,
      environmentResult,
    };
  });
  const { cache, client, environment, environmentResult } = resources;
  const query = useQuery({
    enabled: client !== null,
    networkMode: 'always',
    queryFn: async ({ signal }) => {
      if (client === null) throw new Error('API client is unavailable.');
      try {
        const result = await loadPublicConfig({ cache, client, signal });
        logger.info('public_config_loaded', {
          appEnvironment: environment?.appEnvironment ?? 'unknown',
          configVersion: result.response.configVersion,
          source: result.source,
        });
        return result;
      } catch (error) {
        logger.error('public_config_failed', {
          appEnvironment: environment?.appEnvironment ?? 'unknown',
          correlationId: error instanceof ApiError ? error.correlationId : null,
          errorKind: error instanceof ApiError ? error.kind : 'unknown',
        });
        throw error;
      }
    },
    queryKey: queryKeys.publicConfig(environment?.apiOrigin ?? 'invalid'),
    retry: false,
  });

  let state: RuntimeConfigState;
  if ('error' in environmentResult) {
    state = { error: environmentResult.error, retry: null, status: 'error' };
  } else if (query.isPending) {
    state = { status: 'loading' };
  } else if (query.isError) {
    state = {
      error: query.error instanceof Error ? query.error : new Error('Configuration failed.'),
      retry: () => {
        void query.refetch();
      },
      status: 'error',
    };
  } else {
    state = {
      config: query.data.response.config,
      environment: environmentResult.environment,
      isStale: query.data.isStale,
      response: query.data.response,
      source: query.data.source,
      status: 'ready',
    };
  }

  return <RuntimeConfigContext value={state}>{children}</RuntimeConfigContext>;
}

export function useRuntimeConfig(): RuntimeConfigState {
  return use(RuntimeConfigContext);
}
