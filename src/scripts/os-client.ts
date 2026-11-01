// Platform tabs and copy buttons for the install commands. Which commands show is pure CSS on
// <html data-os>; this keeps the tabs' ARIA state and the hero's "Detected" note in step with it.
const root = document.documentElement;
const LABELS: Record<string, string> = { macos: 'macOS', linux: 'Linux', windows: 'Windows' };

function sync() {
  const os = root.dataset.os && root.dataset.os in LABELS ? root.dataset.os : 'macos';
  // Roving tabindex: only the selected tab is in the Tab order; arrow keys move between the rest.
  for (const tab of document.querySelectorAll<HTMLElement>('[data-os-pick]')) {
    const selected = tab.dataset.osPick === os;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const note of document.querySelectorAll<HTMLElement>('[data-os-note]')) {
    note.textContent = `${root.dataset.osDetected === os ? 'Detected' : 'For'} ${LABELS[os]}`;
  }
}

function pick(os: string) {
  root.dataset.os = os;
  try {
    localStorage.setItem('moonlit-os', os);
  } catch {}
  sync();
}

// Arrow keys, Home and End move between platform tabs and select the one they land on, as in the
// WAI-ARIA tabs pattern.
document.addEventListener('keydown', (event) => {
  const tab = (event.target as Element | null)?.closest<HTMLElement>('[role="tab"][data-os-pick]');
  const list = tab?.closest('[role="tablist"]');
  if (!tab || !list) return;
  const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"][data-os-pick]')];
  const i = tabs.indexOf(tab);
  const next =
    event.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length]
    : event.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length]
    : event.key === 'Home' ? tabs[0]
    : event.key === 'End' ? tabs[tabs.length - 1]
    : null;
  if (!next) return;
  event.preventDefault();
  pick(next.dataset.osPick!);
  next.focus();
});

document.addEventListener('click', (event) => {
  const target = (event.target as Element | null)?.closest<HTMLElement>('[data-os-pick], [data-copy]');
  if (!target) return;
  if (target.dataset.osPick) {
    pick(target.dataset.osPick);
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
