import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Translate from '@docusaurus/Translate';
import Heading from '@theme/Heading';
import styles from './styles.module.css';
import sharedStyles from '../../pages/index.module.css';

export default function HomepageArchitecture(): ReactNode {
  return (
    <section className={`${sharedStyles.section} ${sharedStyles.sectionAlt}`}>
      <div className="container">
        <div className={sharedStyles.sectionHeader}>
          <span className={sharedStyles.sectionEyebrow}>
            <Translate id="homepage.architecture.eyebrow">Under the hood</Translate>
          </span>
          <Heading as="h2" className={sharedStyles.sectionTitle}>
            <Translate id="homepage.architecture.title">
              The sync engine never wakes the JS runtime
            </Translate>
          </Heading>
          <p className={sharedStyles.sectionSubtitle}>
            <Translate id="homepage.architecture.subtitle">
              A background job wakes the native sync orchestrator directly —
              your app doesn't need to be open, and no JS thread ever spins
              up for it.
            </Translate>
          </p>
        </div>

        <div className={styles.diagram}>
          <div className={`${styles.node} ${styles.nodeTop}`}>
            <Translate id="homepage.architecture.node.ts">
              TypeScript (DX layer)
            </Translate>
          </div>

          <div className={styles.arrow}>
            <span className={styles.arrowLabel}>
              <Translate id="homepage.architecture.arrow.jsi">
                JSI (Nitro Modules) — reactive change events flow back
              </Translate>
            </span>
          </div>

          <div className={`${styles.node} ${styles.nodeMid}`}>
            <Translate id="homepage.architecture.node.core">
              Native Core (C++)
            </Translate>
          </div>
          <ul className={styles.leafList}>
            <li>
              <Translate id="homepage.architecture.core.sqlite">
                SQLite + LRU statement cache
              </Translate>
            </li>
            <li>
              <Translate id="homepage.architecture.core.migration">
                Migration Engine (ADD COLUMN)
              </Translate>
            </li>
            <li>
              <Translate id="homepage.architecture.core.trigger">
                Trigger Engine → sync_queue
              </Translate>
            </li>
            <li>
              <Translate id="homepage.architecture.core.orchestrator">
                Sync Orchestrator
              </Translate>
            </li>
            <li>
              <Translate id="homepage.architecture.core.credentials">
                Credential Provider (OAuth2)
              </Translate>
            </li>
            <li>
              <Translate id="homepage.architecture.core.http">HTTP Client</Translate>
            </li>
          </ul>

          <div className={styles.arrow}>
            <span className={styles.arrowLabel}>
              <Translate id="homepage.architecture.arrow.platform">
                platform:: function contracts
              </Translate>
            </span>
          </div>

          <div className={`${styles.node} ${styles.nodeLeaf}`}>
            <Translate id="homepage.architecture.node.shims">
              Swift (iOS) / Kotlin (Android) shims
            </Translate>
          </div>
          <ul className={styles.leafList}>
            <li>
              <Translate id="homepage.architecture.shims.background">
                BGTaskScheduler / WorkManager — background scheduler
              </Translate>
            </li>
            <li>
              <Translate id="homepage.architecture.shims.network">
                NWPathMonitor / ConnectivityManager — network monitor
              </Translate>
            </li>
            <li>
              <Translate id="homepage.architecture.shims.keychain">
                Keychain / Keystore — secure token storage
              </Translate>
            </li>
          </ul>

          <div className={styles.arrow} />

          <div className={`${styles.node} ${styles.nodeBottom}`}>
            <Translate id="homepage.architecture.node.api">Your REST API</Translate>
          </div>
        </div>

        <div className={styles.readMore}>
          <Link to="/docs/architecture">
            <Translate id="homepage.architecture.readMore">
              Read the full architecture breakdown →
            </Translate>
          </Link>
        </div>
      </div>
    </section>
  );
}
