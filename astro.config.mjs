import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { satteri } from '@astrojs/markdown-satteri';
import { mdLinks } from './src/lib/md-links.mjs';
import { DESCRIPTION, DOCS_REPOSITORY, REPOSITORY, SHARE_IMAGE, SITE, SITE_NAME, TAGLINE } from './src/lib/site.mjs';

const shareImage = new URL(SHARE_IMAGE, SITE).href;

const page = (label, slug) => ({ label, slug });

// Archived doc versions read versions.json from the site root, as they did under VitePress.
const copyVersions = {
  name: 'moonlit-versions-json',
  hooks: {
    'astro:build:done': ({ dir }) => {
      copyFileSync(new URL('./versions.json', import.meta.url), fileURLToPath(new URL('versions.json', dir)));
    },
  },
};

export default defineConfig({
  site: SITE,
  markdown: {
    processor: satteri({ mdastPlugins: [mdLinks] }),
  },
  integrations: [
    starlight({
      title: SITE_NAME,
      description: DESCRIPTION,
      favicon: '/logo.png',
      head: [
        { tag: 'meta', attrs: { property: 'og:site_name', content: SITE_NAME } },
        { tag: 'meta', attrs: { property: 'og:image', content: shareImage } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: shareImage } },
        { tag: 'meta', attrs: { name: 'twitter:title', content: `${SITE_NAME} - ${TAGLINE}` } },
      ],
      editLink: { baseUrl: `${DOCS_REPOSITORY}/edit/main/` },
      lastUpdated: true,
      plugins: [
        // The landing page lives outside Starlight, so its anchors can't be validated.
        starlightLinksValidator({ exclude: ['/', '/#*'] }),
      ],
      routeMiddleware: './src/route-middleware.ts',
      components: {
        Header: './src/components/docs/Header.astro',
        SiteTitle: './src/components/docs/SiteTitle.astro',
      },
      expressiveCode: {
        themes: ['github-dark-default', 'github-light-default'],
        styleOverrides: {
          borderRadius: '10px',
          borderColor: 'var(--sl-color-hairline)',
          codeFontFamily: 'var(--font-mono)',
          uiFontFamily: 'var(--font-body)',
          frames: { editorActiveTabIndicatorTopColor: 'var(--moon)', tooltipSuccessBackground: 'var(--moon-deep)' },
        },
      },
      sidebar: [
        {
          label: 'Guide',
          items: [
            {
              label: 'Getting Started',
              items: [
                page('Introduction', 'guide'),
                page('Installation', 'guide/installation'),
                page('GitHub Actions', 'guide/github-actions'),
                page('Quick Start', 'guide/quick-start'),
              ],
            },
            {
              label: 'Core Concepts',
              items: [
                page('How Moonlit Works', 'guide/concepts/how-it-works'),
                page('Using Plugins', 'guide/concepts/plugins'),
                page('Stages and Steps', 'guide/concepts/stages-steps'),
                page('Configuration', 'guide/concepts/configuration'),
                page('Middlewares', 'guide/concepts/middlewares'),
                page('Sandboxing', 'guide/concepts/sandboxing'),
              ],
            },
            {
              label: 'Authoring',
              items: [
                page('Authoring a Plugin', 'guide/advanced/custom-plugins'),
                page('Publishing a Plugin', 'guide/advanced/publishing-plugins'),
                page('Contributing', 'guide/advanced/contributing'),
              ],
            },
          ],
        },
        {
          label: 'Reference',
          items: [
            page('Overview', 'reference'),
            {
              label: 'CLI',
              items: [page('Command Line Interface', 'reference/cli'), page('Configuration File', 'reference/config-file')],
            },
            {
              label: 'API',
              items: [
                page('WIT Contract', 'reference/wit-contract'),
                page('Plugin SDK', 'reference/plugin-development'),
                page('Plugin System Architecture', 'reference/plugin-system'),
              ],
            },
            { label: 'Troubleshooting', items: [page('Error Handling', 'reference/error-handling')] },
          ],
        },
        {
          label: 'Cookbook',
          items: [
            {
              label: 'Recipes',
              items: [
                page('Overview', 'cookbook'),
                page('Docker Deployment', 'cookbook/docker-deployment'),
                page('NuGet Release', 'cookbook/nuget-release'),
                page('Semantic-release to GitHub', 'cookbook/semantic-release-github'),
                page('npm Release', 'cookbook/npm-release'),
                page('GitLab Release', 'cookbook/gitlab-release'),
                page('Publish a Plugin', 'cookbook/publish-plugin'),
              ],
            },
          ],
        },
      ],
      customCss: ['./src/styles/tokens.css', './src/styles/starlight.css'],
      social: [{ icon: 'github', label: 'GitHub', href: REPOSITORY }],
    }),
    copyVersions,
  ],
});
