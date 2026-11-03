import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

// The build runs from the project root; import.meta.url points into the bundle, not at src/.
const read = (path: string) => readFileSync(join(process.cwd(), path));
const font = (pkg: string, file: string) => read(`node_modules/@fontsource/${pkg}/files/${file}`);

// satori reads woff and ttf but not woff2, so these come from the woff builds fontsource ships.
const fonts = [
  { name: 'Chakra Petch', data: font('chakra-petch', 'chakra-petch-latin-700-normal.woff'), weight: 700 },
  { name: 'Chakra Petch', data: font('chakra-petch', 'chakra-petch-latin-600-normal.woff'), weight: 600 },
  { name: 'IBM Plex Sans', data: font('ibm-plex-sans', 'ibm-plex-sans-latin-400-normal.woff'), weight: 400 },
  { name: 'IBM Plex Mono', data: font('ibm-plex-mono', 'ibm-plex-mono-latin-500-normal.woff'), weight: 500 },
] as const;

const logo = `data:image/png;base64,${read('public/logo.png').toString('base64')}`;

// Same palette as src/styles/tokens.css.
const c = {
  bg: '#0b0d0f',
  line: '#efefea',
  mute: '#a0a6a3',
  dim: '#7a8180',
  edge: '#2a2f31',
  moon: '#e9dbb4',
};

// The hero's star field, seeded by the page so every card gets its own sky.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (s: string) => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7);

type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown, extra = {}): Node => ({
  type,
  props: { style, children, ...extra },
});

function stars(key: string): Node[] {
  const rand = mulberry32(hash(key));
  return Array.from({ length: 46 }, () => {
    const size = rand() < 0.15 ? 3 : 2;
    return h('div', {
      position: 'absolute',
      left: Math.round(rand() * OG_WIDTH),
      top: Math.round(rand() * OG_HEIGHT),
      width: size,
      height: size,
      borderRadius: size,
      backgroundColor: c.line,
      opacity: 0.15 + rand() * 0.5,
    });
  });
}

export type Card = { eyebrow: string; title: string; description?: string; key: string };

const titleSize = (title: string) => (title.length > 34 ? 56 : title.length > 22 ? 66 : 76);

export async function renderCard({ eyebrow, title, description, key }: Card): Promise<Buffer> {
  const tree = h(
    'div',
    {
      display: 'flex',
      position: 'relative',
      width: OG_WIDTH,
      height: OG_HEIGHT,
      backgroundColor: c.bg,
      backgroundImage: 'radial-gradient(circle at 85% 50%, rgba(233,219,180,0.20) 0%, rgba(233,219,180,0.06) 30%, rgba(11,13,15,0) 55%)',
      fontFamily: 'IBM Plex Sans',
      color: c.line,
    },
    [
      ...stars(key),
      h('img', { position: 'absolute', right: 28, top: 105, width: 420, height: 420 }, undefined, { src: logo, width: 420, height: 420 }),
      h(
        'div',
        { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 670, height: '100%', padding: '64px 0 56px 72px' },
        [
          h('div', { display: 'flex', alignItems: 'center', gap: 14 }, [
            h('img', { width: 44, height: 44 }, undefined, { src: logo, width: 44, height: 44 }),
            h('div', { fontFamily: 'Chakra Petch', fontWeight: 600, fontSize: 30 }, 'Moonlit'),
          ]),
          h('div', { display: 'flex', flexDirection: 'column', gap: 20 }, [
            h('div', { display: 'flex', fontFamily: 'IBM Plex Mono', fontWeight: 500, fontSize: 22, letterSpacing: 3, color: c.moon, textTransform: 'uppercase' }, eyebrow),
            h('div', { display: 'flex', fontFamily: 'Chakra Petch', fontWeight: 700, fontSize: titleSize(title), lineHeight: 1.05 }, title),
            description
              ? h('div', { display: 'block', fontSize: 26, lineHeight: 1.4, color: c.mute, lineClamp: 3 }, description)
              : null,
          ].filter(Boolean)),
          h('div', { display: 'flex', alignItems: 'center', gap: 16, fontFamily: 'IBM Plex Mono', fontWeight: 500, fontSize: 22, color: c.dim }, [
            h('div', { width: 48, height: 3, backgroundColor: c.moon }),
            'moonlit.rs',
          ]),
        ],
      ),
    ],
  );

  const svg = await satori(tree as never, { width: OG_WIDTH, height: OG_HEIGHT, fonts: fonts as never });
  return new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
}
