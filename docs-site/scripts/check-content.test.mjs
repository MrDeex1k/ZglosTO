import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { checkContent } from './check-content.mjs';
import { checkBuildArtifacts } from './build-artifacts.mjs';
import { pages } from '../content-map.mjs';

const page = {
  slug: 'start',
  source: 'docs/start.md',
  title: 'Start',
  description: 'Opis',
  group: 'Start',
};

test('documentation tests run on Bun', () => {
  assert.ok(process.versions.bun, 'Use bun test for documentation checks');
});

test('current WEB and Mobile role journeys remain published without phase archives', () => {
  const journeys = new Map([
    ['mieszkaniec-web', 'docs/using-web-resident.md'],
    ['sluzby-web', 'docs/using-web-service.md'],
    ['administrator-web', 'docs/using-web-admin.md'],
    ['mieszkaniec-mobile', 'docs/using-mobile-resident.md'],
    ['sluzby-mobile', 'docs/using-mobile-service.md'],
  ]);
  for (const [slug, source] of journeys) {
    const page = pages.find((entry) => entry.slug === slug);
    assert.equal(page?.source, source, `Missing role guide: ${slug}`);
    assert.equal(page.group, 'Korzystanie z aplikacji');
  }
  assert.ok(
    pages.every((entry) => !/(?:^|\/)(?:phase-|bun-phase|release-)/.test(entry.source)),
    'Historical phase and release reports must not appear as current guidance',
  );
});

test('Docker context includes every published Mobile source without exposing the application', async () => {
  const ignore = await readFile(
    new URL('../../frontend/Dockerfile.dockerignore', import.meta.url),
    'utf8',
  );
  const rules = ignore.split('\n');
  for (const page of pages.filter((entry) => entry.source.startsWith('Mobile/'))) {
    assert.ok(rules.includes(`!${page.source}`), `Missing Docker source: ${page.source}`);
  }
  assert.ok(
    !rules.includes('!Mobile/**'),
    'Keep Mobile runtime and private files out of docs build context',
  );
});

test('published instructions reject obsolete PNPM commands but allow historical prose', async (t) => {
  const root = await fixture(
    t,
    '# Start\n\nPreviously used pnpm.\n\n```bash\nbun run check\n```\n',
  );
  await checkContent(root, [page]);
  await writeFile(join(root, 'docs/start.md'), '# Start\n\n```bash\npnpm check\n```\n');
  await assert.rejects(checkContent(root, [page]), /obsolete PNPM command/);
});

async function fixture(t, content) {
  const root = await mkdtemp(join(tmpdir(), 'zglosto-docs-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'docs'));
  await writeFile(join(root, 'docs/start.md'), content);
  await writeFile(join(root, 'docs/target.md'), '# Target\n');
  return root;
}

test('source check handles reference links and ignores code and external URLs', async (t) => {
  const root = await fixture(
    t,
    '# Start\n\n[Link](target.md#anchor)\n\n[ref]: target.md\n\n`[code](missing.md)`\n\n```sh\n[code](missing.md)\n```\n\n[Web](https://example.org)\n',
  );
  assert.deepEqual(await checkContent(root, [page]), { pages: 1, links: 2 });
});

test('source check rejects missing repository targets', async (t) => {
  const root = await fixture(t, '# Start\n\n[Missing](missing.md)\n');
  await assert.rejects(checkContent(root, [page]), /missing link target/);
});

test('Mobile sources are explicitly allowed and resolve links from their own directory', async (t) => {
  const root = await fixture(t, '# Start\n');
  await mkdir(join(root, 'Mobile'));
  await writeFile(join(root, 'Mobile/QUICK_START.md'), '# Mobile\n\n[Start](../docs/start.md)\n');
  const mobile = { ...page, slug: 'mobile-start', source: 'Mobile/QUICK_START.md' };
  assert.deepEqual(await checkContent(root, [page, mobile]), { pages: 2, links: 1 });
  for (const source of [
    'Mobile/PHASE_2_VERIFICATION.md',
    'Mobile/../docs/start.md',
    '../outside.md',
  ]) {
    await assert.rejects(checkContent(root, [{ ...mobile, source }]), /approved canonical/);
  }
});

test('source check rejects escaped paths, duplicate routes and missing titles', async (t) => {
  const root = await fixture(t, '# Start\n\n[Escape](../../outside.md)\n');
  await assert.rejects(checkContent(root, [page]), /outside repository/);
  await writeFile(join(root, 'docs/start.md'), '# Start\n');
  await assert.rejects(checkContent(root, [page, page]), /Duplicate slug/);
  await assert.rejects(checkContent(root, [page, { ...page, slug: 'other' }]), /Duplicate source/);
  await writeFile(join(root, 'docs/start.md'), 'No heading\n');
  await assert.rejects(checkContent(root, [page]), /missing source title/);
});

test('build contract rejects missing search, missing Markdown and an incomplete AI index', async (t) => {
  const root = await fixture(t, '# Start\n');
  const dist = pathToFileURL(`${root}/`);
  await Promise.all(
    [
      'index.html',
      '404.html',
      'llms.txt',
      'llms-full.txt',
      'sitemap-index.xml',
      'pagefind/pagefind.js',
      'pagefind/pagefind-entry.json',
      'start/index.html',
      'start/index.md',
    ].map(async (file) => {
      await mkdir(dirname(join(root, file)), { recursive: true });
      await writeFile(join(root, file), '/docs/start/index.md');
    }),
  );
  await checkBuildArtifacts(dist, [page]);
  await unlink(join(root, 'pagefind/pagefind.js'));
  await assert.rejects(checkBuildArtifacts(dist, [page]), /pagefind\/pagefind.js/);
  await writeFile(join(root, 'pagefind/pagefind.js'), 'search');
  await unlink(join(root, 'start/index.md'));
  await assert.rejects(checkBuildArtifacts(dist, [page]), /start\/index.md/);
  await writeFile(join(root, 'start/index.md'), '# Start');
  await writeFile(join(root, 'llms.txt'), '# Empty index');
  await assert.rejects(checkBuildArtifacts(dist, [page]), /AI index omits/);
});
