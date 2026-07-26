import { motion } from 'motion/react';
import type { IStatusBadgeProps } from './types';

export function StatusBadge({ connected }: IStatusBadgeProps) {
  return (
    <motion.div
      layout
      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
        connected ? 'border-ok/25 bg-ok/10 text-ok' : 'border-danger/25 bg-danger/10 text-danger'
      }`}
    >
      <motion.span
        className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-ok' : 'bg-danger'}`}
        animate={{ opacity: [1, 0.35, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <span>{connected ? 'App connected' : 'Waiting for app…'}</span>
    </motion.div>
  );
}
