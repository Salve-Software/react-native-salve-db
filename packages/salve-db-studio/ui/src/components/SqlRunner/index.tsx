import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { ISqlRunnerProps, IResult } from './types';

export function SqlRunner({ runSql }: ISqlRunnerProps) {
  const [sql, setSql] = useState('');
  const [result, setResult] = useState<IResult | null>(null);

  function handleRun() {
    const trimmed = sql.trim();
    if (!trimmed) return;
    runSql(trimmed)
      .then((rows) => setResult({ text: JSON.stringify(rows, null, 2), isError: false }))
      .catch((err: Error) => setResult({ text: err.message, isError: true }));
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Run SQL</span>
        <span className="text-[11px] text-muted/60">⌘/Ctrl + Enter to run</span>
      </div>

      <textarea
        rows={3}
        value={sql}
        onChange={(event) => setSql(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') handleRun();
        }}
        placeholder="SELECT * FROM sqlite_master"
        className="w-full resize-y rounded-lg border border-line bg-surface p-3 font-mono text-sm text-ink outline-none focus:border-accent"
      />

      <div className="mt-2 flex justify-end">
        <button
          onClick={handleRun}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-strong"
        >
          Run
        </button>
      </div>

      <AnimatePresence>
        {result && (
          <motion.pre
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`mt-2 max-h-64 overflow-auto rounded-lg border p-3 font-mono text-xs ${
              result.isError ? 'border-danger/30 bg-danger/5 text-danger' : 'border-line bg-surface text-muted'
            }`}
          >
            {result.text}
          </motion.pre>
        )}
      </AnimatePresence>
    </div>
  );
}
