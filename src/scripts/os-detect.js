// Runs inline, before the install commands paint, so the page never flashes the wrong platform.
// A platform the reader picked before wins over the detected one.
(() => {
  const root = document.documentElement;
  if (root.dataset.os) return;
  const n = navigator;
  const p = ((n.userAgentData && n.userAgentData.platform) || n.platform || n.userAgent || '').toLowerCase();
  const detected = p.includes('win') ? 'windows' : p.includes('linux') && !p.includes('android') ? 'linux' : p.includes('mac') ? 'macos' : '';
  let picked = null;
  try {
    picked = localStorage.getItem('moonlit-os');
  } catch {}
  // A stale or hand-edited value would match no panel and hide them all.
  if (!['macos', 'linux', 'windows'].includes(picked)) picked = null;
  root.dataset.osDetected = detected;
  root.dataset.os = picked || detected || 'macos';
})();
