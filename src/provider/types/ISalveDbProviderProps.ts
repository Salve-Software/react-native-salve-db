import type { ReactNode } from "react";
import type { IConfigureProps } from "../../database/classes";
import type { AnySchema } from "../../types";

/** Public props — what a consumer app passes to `SalveDbProvider`. */
export interface ISalveDbProviderProps {
  config: IConfigureProps;
  schemas: AnySchema[];
  children: ReactNode;
}
