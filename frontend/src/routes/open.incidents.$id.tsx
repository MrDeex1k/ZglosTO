import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { CurrentResolvedIncidentSchema } from '@zglosto/contracts';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

const IncidentTarget = z.enum(['public', 'resident', 'service']);

export const Route = createFileRoute('/open/incidents/$id')({
  validateSearch: (search) => ({ target: IncidentTarget.safeParse(search.target).data }),
  ssr: false,
  component: IncidentLinkFallback,
});

function IncidentLinkFallback() {
  const { id } = Route.useParams();
  const { target } = Route.useSearch();
  const { t } = useTranslation();
  const valid = z.guid().safeParse(id).success && target !== undefined;

  return (
    <main className="mx-auto max-w-xl space-y-4 px-6 py-12">
      <h1 className="text-2xl font-semibold">
        {valid
          ? t(($) => $.mobile.incidentDetails.title)
          : t(($) => $.mobile.deepLinks.invalidTitle)}
      </h1>
      {!valid ? (
        <p>{t(($) => $.mobile.deepLinks.invalidDescription)}</p>
      ) : (
        <>
          {target === 'public' ? (
            <PublicIncidentDetail id={id} />
          ) : (
            <Link className="block underline" to="/login">
              {t(($) => $.mobile.auth.signIn)}
            </Link>
          )}
          <a
            className="block underline"
            href={`zglosto://open/incidents/${encodeURIComponent(id)}?target=${target}`}
          >
            {t(($) => $.mobile.deepLinks.openInApp)}
          </a>
        </>
      )}
      <Link className="block underline" to="/">
        {t(($) => $.mobile.routes.backHome)}
      </Link>
    </main>
  );
}

function PublicIncidentDetail({ id }: Readonly<{ id: string }>) {
  const { t } = useTranslation();
  const incident = useQuery({
    queryKey: ['public', 'resolved-incident', id],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/mieszkaniec/incydenty/glowna/${encodeURIComponent(id)}`, {
        credentials: 'omit',
        signal,
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('Could not load public incident');
      return CurrentResolvedIncidentSchema.parse(await response.json());
    },
  });

  if (incident.data === undefined) {
    return incident.isError ? (
      <button className="underline" type="button" onClick={() => void incident.refetch()}>
        {t(($) => $.mobile.publicFeed.retry)}
      </button>
    ) : (
      <output className="block">{t(($) => $.mobile.incidentDetails.loading)}</output>
    );
  }
  if (incident.data === null) {
    return <p>{t(($) => $.mobile.incidentDetails.notFoundDescription)}</p>;
  }
  return (
    <article className="space-y-2">
      <h2 className="text-lg font-semibold">{incident.data.opis_zgloszenia}</h2>
      <p>{incident.data.adres_zgloszenia}</p>
      <p>
        {t(($) => $.mobile.incidentDetails.resolvedAt)} {incident.data.data_godzina_rozwiazania}
      </p>
    </article>
  );
}
