import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pages, repository } from '../content-map.mjs';

export function documentLink(href, source, documents = pages) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(href)) return href;
  const [, pathname, suffix = ''] = href.match(/^([^?#]*)(.*)$/);
  const target = posix.normalize(posix.join(posix.dirname(source), pathname));
  if (target.startsWith('../')) throw new Error(`Link outside repository: ${source}: ${href}`);
  const page = documents.find((entry) => entry.source === target);
  return page
    ? `/${page.slug}/${suffix}`
    : `${repository}${target.split('/').map(encodeURIComponent).join('/')}${suffix}`;
}

export function mapMarkdownLinks(markdown, rewriteLink) {
  let fence;
  return markdown
    .split('\n')
    .map((line) => {
      const marker = line.match(/^\s*(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;
        return line;
      }
      if (fence) return line;
      return line
        .split(/(`+[^`]*`+)/g)
        .map((part) => {
          if (part.startsWith('`')) return part;
          return part
            .replace(
              /(!?\[[^\]]*\]\()([^\s)]+)([^)]*\))/g,
              (_, before, href, after) => `${before}${rewriteLink(href)}${after}`,
            )
            .replace(
              /^(\s*\[[^\]]+\]:\s*)(\S+)/,
              (_, before, href) => `${before}${rewriteLink(href)}`,
            );
        })
        .join('');
    })
    .join('\n');
}

export function renderDocument(markdown, page, order) {
  const body = mapMarkdownLinks(markdown.replace(/^# [^\n]+\n+/, ''), (href) =>
    documentLink(href, page.source),
  );
  return `---\ntitle: ${JSON.stringify(page.title)}\ndescription: ${JSON.stringify(page.description)}\nsidebar:\n  order: ${order}\n---\n\n${body}`;
}

export async function syncContent() {
  const site = fileURLToPath(new URL('../', import.meta.url));
  const repo = resolve(site, '..');
  for (const [order, page] of pages.entries()) {
    const markdown = await readFile(resolve(repo, page.source), 'utf8');
    const destination = resolve(site, 'src/content/docs', `${page.slug}.md`);
    await mkdir(dirname(destination), { recursive: true });
    const rendered = renderDocument(markdown, page, order);
    const existing = await readFile(destination, 'utf8').catch(() => null);
    if (existing !== rendered) await writeFile(destination, rendered);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await syncContent();
  console.log(`Published ${pages.length} documents from canonical Markdown sources.`);
}
