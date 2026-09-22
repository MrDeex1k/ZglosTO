import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

export async function checkBuildArtifacts(dist, pages) {
  const files = [
    'index.html',
    '404.html',
    'llms.txt',
    'llms-full.txt',
    'sitemap-index.xml',
    'pagefind/pagefind.js',
    'pagefind/pagefind-entry.json',
    ...pages.flatMap(({ slug }) => [`${slug}/index.html`, `${slug}/index.md`]),
  ];
  await Promise.all(
    files.map(async (file) => {
      const info = await stat(new URL(file, dist)).catch(() => null);
      assert.ok(info?.isFile() && info.size > 0, `Missing or empty build artifact: ${file}`);
    }),
  );
  const index = await readFile(new URL('llms.txt', dist), 'utf8');
  for (const { slug } of pages)
    assert.ok(index.includes(`/docs/${slug}/index.md`), `AI index omits page: ${slug}`);
}
