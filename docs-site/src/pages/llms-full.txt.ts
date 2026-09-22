// Full-corpus markdown for AI agents — every published page in one
// document. Scope and collation live in the framework helper; reshape or
// delete this route to change the site's corpus policy.
import { renderCorpusMarkdown } from '@cloudflare/nimbus-docs';
import { config } from 'virtual:nimbus/config';

export const prerender = true;

export async function GET() {
  const root = new URL('/', config.site).href;
  const docsRoot = new URL(import.meta.env.BASE_URL, config.site).href;
  const body = (await renderCorpusMarkdown()).replaceAll(root, docsRoot);

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
