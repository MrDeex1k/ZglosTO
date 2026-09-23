import {
  getLlmsPayload,
  getLlmsStaticPaths,
  type LlmsEndpointReference,
} from '@cloudflare/nimbus-docs/agent-endpoints';

export const prerender = true;

interface SectionContext {
  params: { section?: string };
  props: { reference?: LlmsEndpointReference };
  request: Request;
}

export const getStaticPaths = () => getLlmsStaticPaths();

export async function GET({ params, props, request }: SectionContext) {
  const reference =
    props.reference ??
    (params.section
      ? ({
          scope: 'section',
          surface: 'index',
          section: params.section,
        } satisfies LlmsEndpointReference)
      : null);
  if (!reference) return new Response('Not found', { status: 404 });
  const payload = await getLlmsPayload(reference, { request });
  if (!payload) return new Response('Not found', { status: 404 });
  return new Response(payload.body, {
    headers: { 'Content-Type': payload.mediaType },
  });
}
