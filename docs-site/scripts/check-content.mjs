import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pages } from '../content-map.mjs';
import { mapMarkdownLinks } from './sync-content.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));

export async function checkContent(root = repository, documents = pages) {
  const slugs = new Set();
  const sources = new Set();
  for (const page of documents) {
    assert.match(page.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid page slug');
    assert.ok(!slugs.has(page.slug), `Duplicate slug: ${page.slug}`);
    assert.ok(!sources.has(page.source), `Duplicate source: ${page.source}`);
    assert.match(
      page.source,
      /^(?:docs\/[a-z0-9-]+\.md|Mobile\/(?:QUICK_START|CLIENT_CONFIGURATION|CLIENT_HANDOFF)\.md)$/,
      'Source must be an approved canonical Markdown file',
    );
    for (const field of ['title', 'description', 'group'])
      assert.ok(
        typeof page[field] === 'string' && page[field].trim(),
        `Missing ${field}: ${page.slug}`,
      );
    slugs.add(page.slug);
    sources.add(page.source);
  }
  const counts = await Promise.all(
    documents.map(async (page) => {
      const file = resolve(root, page.source);
      const markdown = await readFile(file, 'utf8');
      assert.match(markdown, /^# .+\n/, `${page.source}: missing source title`);
      for (const block of markdown.matchAll(/^```(?:bash|sh|shell|console)\s*\n([\s\S]*?)^```/gm)) {
        const commands = block[1]
          .split('\n')
          .filter((line) => !line.trimStart().startsWith('#'))
          .join('\n');
        assert.ok(
          !/\b(?:pnpm|pnpx)\b/.test(commands),
          `${page.source}: obsolete PNPM command; use Bun`,
        );
      }
      const targets = [];
      mapMarkdownLinks(markdown, (href) => {
        if (!/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(href)) targets.push(href);
        return href;
      });
      await Promise.all(
        targets.map(async (href) => {
          const target = resolve(dirname(file), decodeURIComponent(href.split(/[?#]/)[0]));
          const local = relative(root, target);
          assert.ok(
            local !== '..' && !local.startsWith('../'),
            `${page.source}: link outside repository: ${href}`,
          );
          assert.ok(
            await stat(target).catch(() => null),
            `${page.source}: missing link target: ${href}`,
          );
        }),
      );
      return targets.length;
    }),
  );
  return { pages: documents.length, links: counts.reduce((sum, count) => sum + count, 0) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkContent();
  console.log(`Sources: ${result.pages} pages and ${result.links} repository links verified.`);
}
