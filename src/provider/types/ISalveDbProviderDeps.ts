import type { IConfigureProps } from "../../database/classes";
import type { AnySchema } from "../../types";

export interface ISalveDbProviderDeps {
  configure: (props: IConfigureProps) => void;
  register: (schema: AnySchema) => Promise<void>;
  subscribeNative: () => void;
  unsubscribeNative: () => void;
}
