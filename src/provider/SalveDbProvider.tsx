import type { ISalveDbProviderProps, ISalveDbProviderDeps, IDatabaseReadyState } from './types';
import React, { useEffect, useState } from 'react';
import { SalveDbContext } from './SalveDbContext';

export const SalveDbProvider = (props: ISalveDbProviderProps & ISalveDbProviderDeps) => {
  const {
    config,
    schemas,
    children,
    configure,
    register,
    subscribeNative,
  } = props;

  const [state, setState] = useState<IDatabaseReadyState>({ isReady: false, isLoading: true, error: null });

  useEffect(() => {
    let cancelled = false;

    async function onMount() {
      try {
        configure(config);
        for (const schema of schemas) {
          await register(schema);
        }
        subscribeNative();

        if (!cancelled) setState({ isReady: true, isLoading: false, error: null });
      }
      catch (error) {
        if (!cancelled) setState({ isReady: false, isLoading: false, error });
      }
    }
    onMount();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SalveDbContext.Provider value={state}>
      {children}
    </SalveDbContext.Provider>
  );
};
