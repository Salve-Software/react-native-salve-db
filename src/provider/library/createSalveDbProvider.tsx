import type { ISalveDbProviderDeps, ISalveDbProviderProps } from '../types';
import React from 'react';
import { SalveDbProvider } from '../SalveDbProvider';

/**
 * Partially applies `configure`/`register`/`subscribeNative` onto
 * `SalveDbProvider`, returning a component that only asks the consumer for
 * `config`/`schemas`/`children` — kept separate from `Database`/`queryCache`
 * imports so this file (and its tests) never pull in the real native bridge.
 * See `src/provider/index.ts` for the public component wired to the real
 * singletons.
 *
 * `SalveDbProvider` uses hooks internally, so it must be rendered through
 * JSX (not called as a plain function) — this returns a real wrapper
 * component rather than invoking it directly.
 */
export const createSalveDbProvider = ({ configure, register, subscribeNative }: ISalveDbProviderDeps) => {
  return (props: ISalveDbProviderProps) => {
    return (
      <SalveDbProvider
        {...props}
        configure={configure}
        register={register}
        subscribeNative={subscribeNative}
      />
    );
  };
};
