import type {ReactNode} from 'react';
import Translate from '@docusaurus/Translate';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  id: string;
  title: ReactNode;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    id: 'nativeSync',
    title: (
      <Translate id="homepage.features.nativeSync.title">
        Sync runs 100% natively
      </Translate>
    ),
    description: (
      <Translate id="homepage.features.nativeSync.description">
        The sync orchestrator, HTTP client, credential provider, and
        background scheduler live entirely in C++/Swift/Kotlin. No JS bundle,
        no JS thread, no headless task required.
      </Translate>
    ),
  },
  {
    id: 'declarativeSchemas',
    title: (
      <Translate id="homepage.features.declarativeSchemas.title">
        Declarative schemas
      </Translate>
    ),
    description: (
      <Translate id="homepage.features.declarativeSchemas.description">
        Tables, indexes, relations, and sync contracts are plain TypeScript
        data, interpreted natively. No SQL to write, no codegen step for
        schema changes.
      </Translate>
    ),
  },
  {
    id: 'syncQueue',
    title: (
      <Translate id="homepage.features.syncQueue.title">
        Automatic sync queue
      </Translate>
    ),
    description: (
      <>
        <Translate id="homepage.features.syncQueue.description.part1">
          Every
        </Translate>{' '}
        <code>INSERT</code>/<code>UPDATE</code>/<code>DELETE</code>{' '}
        <Translate id="homepage.features.syncQueue.description.part2">
          — including raw SQL — is captured by a SQLite trigger and queued for
          sync. You never call
        </Translate>{' '}
        <code>enqueue</code>{' '}
        <Translate id="homepage.features.syncQueue.description.part3">
          yourself.
        </Translate>
      </>
    ),
  },
  {
    id: 'typedQueryBuilder',
    title: (
      <Translate id="homepage.features.typedQueryBuilder.title">
        Typed query builder
      </Translate>
    ),
    description: (
      <>
        <Translate id="homepage.features.typedQueryBuilder.description.part1">
          Drizzle-style
        </Translate>{' '}
        <code>select</code>/<code>insert</code>/<code>update</code>/
        <code>delete</code>/<code>transaction</code>,{' '}
        <Translate id="homepage.features.typedQueryBuilder.description.part2">
          fully typed from your schema via
        </Translate>{' '}
        <code>InferSelectModel</code>/<code>InferInsertModel</code>.
      </>
    ),
  },
  {
    id: 'reactiveHooks',
    title: (
      <Translate id="homepage.features.reactiveHooks.title">
        Reactive hooks
      </Translate>
    ),
    description: (
      <>
        <code>useQuery</code> <Translate id="homepage.features.reactiveHooks.description.part1">and</Translate>{' '}
        <code>useInfiniteQuery</code>{' '}
        <Translate id="homepage.features.reactiveHooks.description.part2">
          subscribe to table changes and re-run automatically, no matter
          whether the write came from your code or the sync engine.
        </Translate>
      </>
    ),
  },
  {
    id: 'oauth2',
    title: (
      <Translate id="homepage.features.oauth2.title">
        OAuth2 out of the box
      </Translate>
    ),
    description: (
      <Translate id="homepage.features.oauth2.description">
        Access/refresh tokens stored in Keychain (iOS) / Keystore (Android),
        refreshed natively — no token juggling in JS.
      </Translate>
    ),
  },
];

function Feature({title, description}: FeatureItem) {
  return (
    <div className={styles.feature}>
      <Heading as="h3">{title}</Heading>
      <p>{description}</p>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>
          <Translate id="homepage.features.sectionTitle">
            Everything a background sync engine should be, none of the JS
            baggage
          </Translate>
        </Heading>
        <div className={styles.grid}>
          {FeatureList.map((props) => (
            <Feature key={props.id} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
