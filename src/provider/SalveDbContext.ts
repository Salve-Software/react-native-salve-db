import type { IDatabaseReadyState } from './types';
import { createContext } from 'react';

export const SalveDbContext = createContext<IDatabaseReadyState>({
  isReady: false,
  isLoading: true,
  error: null,
});
