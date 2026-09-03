import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Translate from '@docusaurus/Translate';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

export default function HomepageStudio(): ReactNode {
  const screenshot = useBaseUrl('img/db-studio.png');
  return (
    <section className={styles.section}>
      <div className={`container ${styles.grid}`}>
        <div>
          <p className={styles.eyebrow}>
            <Translate id="homepage.studio.eyebrow">Salve DB Studio</Translate>
          </p>
          <Heading as="h2">
            <Translate id="homepage.studio.title">
              Browse and edit your running app's database, live
            </Translate>
          </Heading>
          <p className={styles.lead}>
            <Translate id="homepage.studio.lead">
              A local, live-connected UI — Prisma/Drizzle Studio style — for
              the SQLite database inside your running app. No extra setup:
              your app auto-connects over WebSocket the moment you call
              Database.configure(...) in development.
            </Translate>
          </p>
          <ul className={styles.list}>
            <li>
              <Translate id="homepage.studio.list.tables">
                Browse every table, including internal sync-engine tables
              </Translate>
            </li>
            <li>
              <Translate id="homepage.studio.list.edit">
                Insert, edit, and delete rows against the live device
              </Translate>
            </li>
            <li>
              <Translate id="homepage.studio.list.sql">
                Run raw SQL against the running database
              </Translate>
            </li>
            <li>
              <Translate id="homepage.studio.list.devices">
                Multiple devices/simulators, one device selector
              </Translate>
            </li>
          </ul>
          <Link className="button button--primary" to="/docs/studio">
            <Translate id="homepage.studio.cta">
              Learn how to use Studio →
            </Translate>
          </Link>
        </div>
        <img
          src={screenshot}
          alt="Salve DB Studio"
          className={styles.screenshot}
        />
      </div>
    </section>
  );
}
