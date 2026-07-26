import { motion, AnimatePresence } from 'motion/react';

interface IToastProps {
  message: string | null;
  onDismiss: () => void;
}

export function Toast({ message, onDismiss }: IToastProps) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50">
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border border-danger/30 bg-surface px-4 py-3 text-sm text-ink shadow-lg shadow-black/40"
          >
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
            <span className="flex-1">{message}</span>
            <button onClick={onDismiss} className="text-muted transition-colors hover:text-ink">
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
