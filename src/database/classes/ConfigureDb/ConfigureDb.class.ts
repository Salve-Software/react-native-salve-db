import type { SalveDatabase } from '../../../specs/SalveDatabase.nitro';
import type { IConfigureProps, IRegisterProps } from './types';
import { registerAppOpenSync } from './library/registerAppOpenSync';
import { mapCredentials } from './library/mapCredentials';
import { registerSyncBridge } from '../../../sync';
import { StudioAgent } from '../../../studio';

export class ConfigureDb {
  private static _configured = false;
  private static _syncOnAppOpen = true;

  private readonly _studioAgent: StudioAgent;

  constructor(private readonly _bridge: SalveDatabase) {
    this._studioAgent = new StudioAgent(_bridge);
  }

  configure(props: IConfigureProps): void {
    if (!props.name || props.name.trim() === '') {
      throw new Error("Database.configure: 'name' is required");
    }

    const syncOnAppOpen = props.syncOnAppOpen ?? true;

    this._bridge.configure({
      name: props.name,
      baseUrl: props.baseUrl,
      network: props.network,
      credentials: props.credentials !== undefined
        ? mapCredentials(props.credentials)
        : undefined,
      walMode: props.walMode ?? true,
      syncOnAppOpen,
      background: props.background,
    });

    ConfigureDb._configured = true;
    ConfigureDb._syncOnAppOpen = syncOnAppOpen;
    registerAppOpenSync(this._bridge, () => ConfigureDb._syncOnAppOpen);
    registerSyncBridge(this._bridge);

    if (__DEV__) {
      this._studioAgent.start(undefined, props.name);
    }
  }

  register(props: IRegisterProps): Promise<void> {
    const { schema } = props;

    this._assertConfigured('register');

    if (!schema.name || typeof schema.version !== 'number' || !schema.primaryKey) {
      throw new Error(
        "Database.register: schema must have 'name', 'version', and 'primaryKey'"
      );
    }

    if (!(schema.primaryKey in schema.columns)) {
      throw new Error(
        `Database.register: primaryKey '${String(schema.primaryKey)}' must exist in schema.columns`
      );
    }

    return this._bridge.registerSchema(JSON.stringify(schema));
  }

  static isConfigured(): boolean {
    return ConfigureDb._configured;
  }

  private _assertConfigured(method: string): void {
    if (!ConfigureDb._configured) {
      throw new Error(`Database.${method}: call Database.configure() first`);
    }
  }
}
