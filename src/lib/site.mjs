export const SITE = 'https://moonlit.rs';
export const SITE_NAME = 'Moonlit';
export const REPOSITORY = 'https://github.com/wolfware-labs/moonlit';
export const DOCS_REPOSITORY = 'https://github.com/wolfware-labs/moonlit-docs';
// Per-plugin reference (middlewares, config, outputs, permissions) lives in the registry, read from
// each plugin package. The docs link here instead of keeping a second copy.
export const REGISTRY_URL = 'https://registry.moonlit.rs';
export const TAGLINE = 'Bring light to your release process';
export const DESCRIPTION =
  'A Rust and WebAssembly build and release automation engine. Declare your pipeline in YAML and sandboxed WASM plugins do the rest.';
export const SHARE_IMAGE = '/logo_portrait.png';
export const SHARE_IMAGE_WIDTH = '1200';
export const SHARE_IMAGE_HEIGHT = '628';
export const SHARE_IMAGE_ALT = 'The Moonlit logo: a grey wolf howling in front of a cream moon';

// The three docs sections. The header shows them as tabs, and the sidebar only lists the one the
// reader is in.
export const SECTIONS = [
  { label: 'Guide', href: '/guide/', prefix: 'guide' },
  { label: 'Reference', href: '/reference/', prefix: 'reference' },
  { label: 'Cookbook', href: '/cookbook/', prefix: 'cookbook' },
];

const RELEASE = `${REPOSITORY}/releases/latest/download`;

// Install channels per platform. `hero` is the short one-liner the landing hero shows; `primary`
// is the recommended channel; `others` are the alternatives.
export const PLATFORMS = [
  {
    id: 'macos',
    label: 'macOS',
    hero: { prompt: '$', command: 'brew install wolfware-labs/tap/moonlit' },
    primary: { title: 'Homebrew', command: 'brew install wolfware-labs/tap/moonlit' },
    others: [
      { title: 'Installer script', command: `curl --proto '=https' --tlsv1.2 -LsSf ${RELEASE}/moonlit-installer.sh | sh` },
      { title: 'npm', command: 'npm install -g @moonlitbuild/cli' },
    ],
  },
  {
    id: 'linux',
    label: 'Linux',
    hero: { prompt: '$', command: 'brew install wolfware-labs/tap/moonlit' },
    primary: { title: 'Installer script', command: `curl --proto '=https' --tlsv1.2 -LsSf ${RELEASE}/moonlit-installer.sh | sh` },
    others: [
      { title: 'Homebrew', command: 'brew install wolfware-labs/tap/moonlit' },
      { title: 'npm', command: 'npm install -g @moonlitbuild/cli' },
    ],
  },
  {
    id: 'windows',
    label: 'Windows',
    hero: { prompt: 'PS>', command: 'choco install moonlit' },
    primary: { title: 'PowerShell', command: `irm ${RELEASE}/moonlit-installer.ps1 | iex` },
    others: [
      { title: 'Chocolatey', command: 'choco install moonlit' },
      { title: 'npm', command: 'npm install -g @moonlitbuild/cli' },
    ],
  },
];
