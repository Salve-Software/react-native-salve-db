import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

/**
 * Manually curated so ordering reflects the learning path: what/why → install
 * → first working example → deep-dive guides → reference material.
 */
const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: ['getting-started/installation', 'getting-started/quick-start'],
    },
    {
      type: 'category',
      label: 'Guides',
      collapsed: false,
      items: [
        'guides/schemas',
        'guides/query-builder',
        'guides/hooks',
        'guides/sync',
        'guides/credentials-oauth2',
        'guides/background-sync',
        'guides/migrations',
        'guides/current-user',
      ],
    },
    'architecture',
    'studio',
    'server',
    {
      type: 'category',
      label: 'API Reference',
      items: ['api-reference/database', 'api-reference/hooks', 'api-reference/operators-types'],
    },
    'testing',
    'faq-troubleshooting',
  ],
};

export default sidebars;
