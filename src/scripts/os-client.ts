// Platform tabs and copy buttons for the install commands. Which commands show is pure CSS on
// <html data-os>; this keeps the tabs' ARIA state and the hero's "Detected" note in step with it.
const root = document.documentElement;
const LABELS: Record<string, string> = { macos: 'macOS', linux: 'Linux', windows: 'Windows' };

function sync() {
  const os = root.dataset.os && root.dataset.os in LABELS ? root.dataset.os : 'macos';
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
  copy(target);
});

// The clipboard API is missing outside secure contexts and rejects when permission is denied. In
// either case, select the command instead so the reader can copy it by hand.
async function copy(button: HTMLElement) {
  try {
    if (!navigator.clipboard) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(button.dataset.copy ?? '');
    button.dataset.copied = '';
    setTimeout(() => delete button.dataset.copied, 1500);
  } catch {
    const code = button.parentElement?.querySelector('code');
    const selection = window.getSelection();
    if (!code || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(code);
    // The hero's command starts with a shell prompt that isn't part of the command.
    const prompt = code.querySelector('.prompt');
    if (prompt) range.setStartAfter(prompt);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

sync();
