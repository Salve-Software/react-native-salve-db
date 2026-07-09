import type { SalveDatabase } from '../../../specs/SalveDatabase.nitro';
import type { IConfigureProps, IRegisterProps } from './types';
import { NitroModules } from 'react-native-nitro-modules';

const _bridge = NitroModules.createHybridObject<SalveDatabase>('SalveDatabase');

export class ConfigureDb {
  private static _configured = false;

  constructor() {}

  configure(props: IConfigureProps): void {
    const { name } = props;
    
    if (!name || name.trim() === '') {
      throw new Error("Database.configure: 'name' is required");
    }
    _bridge.configure(JSON.stringify(props));
    ConfigureDb._configured = true;
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

    return _bridge.registerSchema(JSON.stringify(schema));
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
