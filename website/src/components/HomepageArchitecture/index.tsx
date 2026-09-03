import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Translate from '@docusaurus/Translate';
import Heading from '@theme/Heading';
import CodeBlock from '@theme/CodeBlock';
import styles from './styles.module.css';

const DIAGRAM = `┌─────────────────────────────┐        JSI (Nitro Modules)        ┌──────────────────────────────┐
│   TypeScript (DX layer)      │ ─────────────────────────────────▶ │      Native Core (C++)        │
│                               │                                    │                                │
│  Database.configure/register │                                    │  SQLite + LRU statement cache  │
│  Query Builder                │ ◀───────────────────────────────── │  Migration Engine (ADD COLUMN) │
│  useQuery / useInfiniteQuery │        reactive change events      │  Trigger Engine → sync_queue   │
│  <SalveDbProvider>            │                                    │  Sync Orchestrator             │
└─────────────────────────────┘                                    │  Credential Provider (OAuth2)  │
                                                                      │  HTTP Client                   │
                                                                      └───────────────┬────────────────┘
                                                                                       │
                                                        ┌──────────────────────────────┴──────────────────────────────┐
                                                        │           Swift (iOS) / Kotlin (Android) shims                │
                                                        │  BGTaskScheduler / WorkManager — background scheduler         │
                                                        │  NWPathMonitor / ConnectivityManager — network monitor        │
                                                        │  Keychain / Keystore — secure token storage                   │
                                                        └──────────────────────────────┬──────────────────────────────┘
                                                                                       ▼
                                                                               Your REST API`;

export default function HomepageArchitecture(): ReactNode {
  return (
    <section className={styles.section}>
      <div className="container">
        <div className={styles.header}>
          <p className={styles.eyebrow}>
            <Translate id="homepage.architecture.eyebrow">
              Under the hood
            </Translate>
          </p>
          <Heading as="h2">
            <Translate id="homepage.architecture.title">
              The sync engine never wakes the JS runtime
            </Translate>
          </Heading>
          <p className={styles.lead}>
            <Translate id="homepage.architecture.lead">
              A background job (WorkManager on Android, BGTaskScheduler on
              iOS) wakes the native sync orchestrator directly. Your app
              doesn't need to be open — and no JS thread ever spins up for it.
            </Translate>
          </p>
        </div>
        <CodeBlock language="text" className={styles.diagram}>
          {DIAGRAM}
        </CodeBlock>
        <div className={styles.ctaRow}>
          <Link className="button button--outline button--primary" to="/docs/architecture">
            <Translate id="homepage.architecture.cta">
              Read the full architecture breakdown →
            </Translate>
          </Link>
        </div>
      </div>
    </section>
  );
}
