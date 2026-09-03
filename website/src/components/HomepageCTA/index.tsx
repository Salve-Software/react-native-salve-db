import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Translate from '@docusaurus/Translate';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

export default function HomepageCTA(): ReactNode {
  return (
    <section className={styles.section}>
      <div className={`container ${styles.inner}`}>
        <Heading as="h2">
          <Translate id="homepage.cta.title">
            Ready to go offline-first?
          </Translate>
        </Heading>
        <p>
          <Translate id="homepage.cta.lead"
            values={{
              provider: <code>SalveDbProvider</code>,
            }}>
            {'Declare a schema, wrap your app in {provider}, and you have typed queries, reactive hooks, and native background sync in minutes.'}
          </Translate>
        </p>
        <div className={styles.buttons}>
          <Link className="button button--lg button--primary" to="/docs/getting-started/quick-start">
            <Translate id="homepage.cta.quickStart">Quick Start</Translate>
          </Link>
          <Link
            className="button button--lg button--outline button--secondary"
            href="https://github.com/Salve-Software/react-native-salve-db">
            <Translate id="homepage.cta.github">View on GitHub</Translate>
          </Link>
        </div>
      </div>
    </section>
  );
}
