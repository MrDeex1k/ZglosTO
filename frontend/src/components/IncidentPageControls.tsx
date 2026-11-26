import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';

export type IncidentPagination = Pick<
  UseInfiniteQueryResult,
  | 'hasNextPage'
  | 'isPending'
  | 'isFetching'
  | 'isLoadingError'
  | 'isFetchNextPageError'
  | 'fetchNextPage'
  | 'refetch'
>;

export function IncidentPageControls({ pagination }: { pagination: IncidentPagination }) {
  const { t } = useTranslation();
  if (pagination.isLoadingError) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <p role="alert">{t(($) => $.incidents.management.loadFailed)}</p>
        <Button variant="outline" className="mt-3" onClick={() => void pagination.refetch()}>
          {t(($) => $.home.retry)}
        </Button>
      </div>
    );
  }
  if (pagination.isPending) {
    return <output>{t(($) => $.home.loading)}</output>;
  }
  if (!pagination.hasNextPage) return null;
  return (
    <div className="mt-4 text-center">
      {pagination.isFetchNextPageError && (
        <p role="alert">{t(($) => $.incidents.management.loadFailed)}</p>
      )}
      <Button
        variant="outline"
        disabled={pagination.isFetching}
        onClick={() => void pagination.fetchNextPage()}
      >
        {pagination.isFetchNextPageError ? t(($) => $.home.retry) : t(($) => $.common.showMore)}
      </Button>
    </div>
  );
}
