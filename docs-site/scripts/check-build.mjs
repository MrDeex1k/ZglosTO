import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pages } from '../content-map.mjs';
import { checkBuildArtifacts } from './build-artifacts.mjs';

const dist = new URL('../dist/', import.meta.url);
await checkBuildArtifacts(dist, pages);
const documents = ['index.html', ...pages.map((page) => `${page.slug}/index.html`)];
let links = 0;
for (const document of documents) {
  const html = await readFile(new URL(document, dist), 'utf8');
  for (const match of html.matchAll(/(?:href|src)="(\/docs\/[^"?]*)(?:\?[^"#]*)?"/g)) {
    const [pathname, anchor] = match[1].split('#');
    let target = new URL(decodeURIComponent(pathname.slice('/docs/'.length)), dist);
    const info = await stat(target).catch(() => null);
    assert.ok(info, `${document}: missing ${pathname}`);
    if (info.isDirectory())
      target = new URL(
        'index.html',
        target.href.endsWith('/') ? target : new URL(`${target.href}/`),
      );
    const content = await readFile(target, 'utf8');
    if (anchor)
      assert.ok(
        content.includes(`id="${decodeURIComponent(anchor)}"`),
        `${document}: missing anchor ${match[1]}`,
      );
    links++;
  }
  assert.ok(
    !html.includes('href="http://localhost:1235/docs/start/index.md"'),
    'Markdown action must remain same-origin',
  );
}
console.log(
  `Verified ${documents.length} pages and ${links} local links/assets in ${fileURLToPath(dist)}.`,
);

if (process.env.DOCS_TEST_ORIGIN) {
  const origin = process.env.DOCS_TEST_ORIGIN;
  for (const path of ['/docs', '/docs/start']) {
    const response = await fetch(new URL(path, origin), { redirect: 'manual' });
    assert.ok([301, 308].includes(response.status), `Redirect missing: ${path}`);
    assert.equal(
      response.headers.get('location'),
      `${path}/`,
      'Redirect must not expose internal container port',
    );
  }
  for (const page of ['', ...pages.map((item) => `${item.slug}/`)]) {
    const response = await fetch(new URL(`/docs/${page}`, origin));
    assert.equal(response.status, 200, page);
    assert.match(response.headers.get('content-type'), /text\/html/);
  }
  const markdown = await fetch(new URL('/docs/start/index.md', origin));
  assert.equal(markdown.status, 200);
  assert.ok((await markdown.text()).includes('docker compose up -d --build'));
  const search = await fetch(new URL('/docs/pagefind/pagefind.js', origin));
  assert.equal(search.status, 200);
  assert.match(search.headers.get('content-type'), /javascript/);
  const missing = await fetch(new URL('/docs/nonexistent-review-page/', origin));
  assert.equal(missing.status, 404);
  assert.ok((await missing.text()).includes('Nie znaleziono strony'));
  console.log('Nginx: redirects, all pages, Markdown, Pagefind and real 404 verified.');
}
