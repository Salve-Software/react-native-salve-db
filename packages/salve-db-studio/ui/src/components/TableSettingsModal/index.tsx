import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Eraser, Trash2, X } from 'lucide-react';
import type { ITableSettingsModalProps } from './types';

type PendingAction = 'truncate' | 'delete' | null;

export function TableSettingsModal({ table, isSystem, onTruncate, onDelete, onClose }: ITableSettingsModalProps) {
  const [pending, setPending] = useState<PendingAction>(null);

  function handleClose() {
    setPending(null);
    onClose();
  }

  function handleConfirm() {
    if (!table) return;
    if (pending === 'truncate') onTruncate(table);
    if (pending === 'delete') onDelete(table);
    handleClose();
  }

  return (
    <AnimatePresence>
      {table && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50" onClick={handleClose}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            onClick={(event) => event.stopPropagation()}
            className="w-80 rounded-lg border border-line bg-surface p-4 shadow-xl shadow-black/40"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="truncate text-sm font-semibold text-ink">{table}</h3>
              <button onClick={handleClose} aria-label="Close" className="text-muted transition-colors hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>

            {pending ? (
              <div className="space-y-3">
                <p className="text-xs text-muted">
                  {pending === 'truncate'
                    ? `Delete every row in "${table}"? This cannot be undone.`
                    : `Permanently delete the "${table}" table? This cannot be undone.`}
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setPending(null)}
                    className="rounded-md border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirm}
                    className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-canvas"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => setPending('truncate')}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ink/80 transition-colors hover:bg-white/5"
                >
                  <Eraser className="h-4 w-4 text-muted" />
                  Truncate table
                </button>
                {!isSystem && (
                  <button
                    onClick={() => setPending('delete')}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete table
                  </button>
                )}
                {isSystem && (
                  <p className="px-3 pt-1 text-xs text-muted/70">Internal tables can only be truncated.</p>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
