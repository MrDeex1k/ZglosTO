import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { documentLink, removeStaleGeneratedPages, renderDocument } from './sync-content.mjs';

test('published links retain anchors; unpublished sources point at GitHub', () => {
  assert.equal(
    documentLink('backup-restore.md#restore', 'docs/local-development.md'),
    '/backup/#restore',
  );
  assert.equal(
    documentLink('../Mobile/QUICK_START.md', 'docs/local-development.md'),
    '/mobile-start/',
  );
  assert.equal(
    documentLink('https://example.org/a', 'docs/local-development.md'),
    'https://example.org/a',
  );
  assert.equal(documentLink('#wymagania', 'docs/local-development.md'), '#wymagania');
  assert.equal(
    documentLink('deployment-selection.md', 'docs/white-label-configuration.md'),
    '/wdrozenie/',
  );
  assert.equal(documentLink('white-label-configuration.md', 'docs/README.md'), '/konfiguracja/');
  assert.equal(
    documentLink('phase-12-white-label-rollout.md', 'docs/white-label-configuration.md'),
    'https://github.com/MrDeex1k/ZglosTO/blob/main/docs/phase-12-white-label-rollout.md',
  );
  assert.throws(() => documentLink('../../outside.md', 'docs/local-development.md'));
  assert.equal(
    documentLink('CLIENT_CONFIGURATION.md', 'Mobile/CLIENT_HANDOFF.md'),
    '/mobile-konfiguracja/',
  );
  assert.equal(
    documentLink('../docs/mobile-build.md', 'Mobile/CLIENT_HANDOFF.md'),
    '/mobile-build/',
  );
  assert.equal(
    documentLink('ARCHITECTURE.md', 'Mobile/CLIENT_HANDOFF.md'),
    'https://github.com/MrDeex1k/ZglosTO/blob/main/Mobile/ARCHITECTURE.md',
  );
});

test('publishing removes duplicate H1, rewrites links and preserves code', () => {
  const page = { source: 'docs/local-development.md', title: 'Start', description: 'Opis' };
  const code = '```bash\necho "[backup](backup-restore.md)"\n```';
  const output = renderDocument(
    `# Start\n\n[Backup](backup-restore.md)\n\n${code}\n\n\`[backup](backup-restore.md)\``,
    page,
    0,
  );
  assert.ok(output.includes('[Backup](/backup/)'));
  assert.ok(output.includes(code));
  assert.ok(output.includes('`[backup](backup-restore.md)`'));
  assert.ok(!output.includes('# Start'));
});

test('publishing removes only stale generated Markdown pages', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zglosto-docs-sync-'));
  try {
    await writeFile(join(directory, 'current.md'), 'current');
    await writeFile(join(directory, 'removed.md'), 'removed');
    await writeFile(join(directory, 'notes.txt'), 'notes');
    await removeStaleGeneratedPages(directory, [{ slug: 'current' }]);
    assert.equal(await readFile(join(directory, 'current.md'), 'utf8'), 'current');
    assert.equal(await readFile(join(directory, 'notes.txt'), 'utf8'), 'notes');
    await assert.rejects(readFile(join(directory, 'removed.md'), 'utf8'), { code: 'ENOENT' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
