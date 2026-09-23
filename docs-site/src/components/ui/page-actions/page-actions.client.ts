import { mount } from '@cloudflare/nimbus-docs/client';

function initPageActions(root: HTMLElement): () => void {
  const copyBtn = root.querySelector<HTMLButtonElement>('[data-nb-page-actions-copy]');
  const copyIcon = root.querySelector<SVGElement>('[data-nb-page-actions-copy-icon]');
  const checkIcon = root.querySelector<SVGElement>('[data-nb-page-actions-check-icon]');
  const label = root.querySelector<HTMLSpanElement>('[data-nb-page-actions-label]');
  const mdUrl = root.dataset.mdUrl;

  if (!copyBtn || !mdUrl) return () => {};

  let resetTimer: number | undefined;

  function showState(state: 'copied' | 'error') {
    if (!copyIcon || !checkIcon || !label) return;
    if (state === 'copied') {
      copyIcon.classList.add('hidden');
      checkIcon.classList.remove('hidden');
      label.textContent = 'Skopiowano';
    } else {
      label.textContent = 'Nie udało się skopiować';
    }
    if (resetTimer) window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      copyIcon.classList.remove('hidden');
      checkIcon.classList.add('hidden');
      label.textContent = 'Kopiuj stronę';
    }, 1500);
  }

  async function handleCopyPage() {
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        const markdown = fetch(mdUrl!).then(async (res) => {
          if (!res.ok) throw new Error('Markdown unavailable');
          return new Blob([await res.text()], { type: 'text/plain' });
        });
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': markdown })]);
      } else {
        const res = await fetch(mdUrl!);
        if (!res.ok) throw new Error('Markdown unavailable');
        await navigator.clipboard.writeText(await res.text());
      }
      showState('copied');
    } catch {
      showState('error');
    }
  }

  copyBtn.addEventListener('click', handleCopyPage);

  return () => {
    if (resetTimer) window.clearTimeout(resetTimer);
    copyBtn.removeEventListener('click', handleCopyPage);
  };
}

mount('[data-nb-page-actions]', initPageActions);
