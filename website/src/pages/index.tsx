import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Translate, {translate} from '@docusaurus/Translate';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import CodeBlock from '@theme/CodeBlock';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import HomepageArchitecture from '@site/src/components/HomepageArchitecture';
import HomepageStudio from '@site/src/components/HomepageStudio';
import HomepageCTA from '@site/src/components/HomepageCTA';

import styles from './index.module.css';

const SAMPLE = `Database.select(UserSchema)
  .where(and(eq('id', 1), like('email', '%@company.com')))
  .orderBy('updatedAt', 'desc')
  .limit(50)
  .execute();

// every write here queues automatically for the native sync engine
Database.insert(UserSchema)
  .values({ id: 2, name: 'Ada', email: 'ada@co.com', updatedAt: Date.now() })
  .execute();`;

function HomepageHeader() {
  return (
    <header className={styles.heroBanner}>
      <span className={styles.heroStripe} />
      <div className={`container ${styles.heroInner}`}>
        <p className={styles.eyebrow}>
          <Translate id="homepage.hero.badge">
            Nitro Modules · SQLite · C++ / Swift / Kotlin
          </Translate>
        </p>
        <Heading as="h1" className={styles.heroTitle}>
          <Translate id="homepage.hero.title">
            Offline-first SQLite for React Native, synced entirely in native
            code
          </Translate>
        </Heading>
        <p className={styles.heroSubtitle}>
          <Translate id="homepage.hero.subtitle">
            Offline-first SQLite for React Native with a 100% native sync
            engine.
          </Translate>
        </p>
        <div className={styles.buttons}>
          <Link className="button button--primary button--lg" to="/docs/intro">
            <Translate id="homepage.hero.cta.getStarted">Get Started</Translate>
          </Link>
          <Link
            className="button button--outline button--lg"
            href="https://github.com/Salve-Software/react-native-salve-db">
            <Translate id="homepage.hero.cta.github">GitHub</Translate>
          </Link>
        </div>
        <div className={styles.codeSample}>
          <CodeBlock language="ts" title="query.ts">
            {SAMPLE}
          </CodeBlock>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const description = translate({
    id: 'homepage.metaDescription',
    message:
      'Offline-first SQLite database for React Native. Declare your tables and REST sync contract as TypeScript data; a native C++/Swift/Kotlin core handles migrations, triggers, and background sync — no JS engine required.',
  });

  return (
    <Layout
      title={translate({
        id: 'homepage.metaTitle',
        message: 'Salve DB: Offline-first SQLite for React Native',
      })}
      description={description}>
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <HomepageArchitecture />
        <HomepageStudio />
        <HomepageCTA />
      </main>
    </Layout>
  );
}
