// Platform tabs and copy buttons for the install commands. Which commands show is pure CSS on
// <html data-os>; this keeps the tabs' ARIA state and the hero's "Detected" note in step with it.
const root = document.documentElement;
const LABELS: Record<string, string> = { macos: 'macOS', linux: 'Linux', windows: 'Windows' };

function sync() {
  const os = root.dataset.os ?? 'macos';
  for (const tab of document.querySelectorAll<HTMLElement>('[data-os-pick]')) {
    tab.setAttribute('aria-selected', String(tab.dataset.osPick === os));
  }
  for (const note of document.querySelectorAll<HTMLElement>('[data-os-note]')) {
    note.textContent = `${root.dataset.osDetected === os ? 'Detected' : 'For'} ${LABELS[os]}`;
  }
}

document.addEventListener('click', (event) => {
  const target = (event.target as Element | null)?.closest<HTMLElement>('[data-os-pick], [data-copy]');
  if (!target) return;
  if (target.dataset.osPick) {
    root.dataset.os = target.dataset.osPick;
    try {
      localStorage.setItem('moonlit-os', target.dataset.osPick);
    } catch {}
    sync();
    return;
  }
  navigator.clipboard?.writeText(target.dataset.copy ?? '').then(() => {
    target.dataset.copied = '';
    setTimeout(() => delete target.dataset.copied, 1500);
  });
});

sync();
