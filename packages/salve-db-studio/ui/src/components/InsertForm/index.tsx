import { useState } from 'react';
import { motion } from 'motion/react';
import type { IInsertFormProps } from './types';

export function InsertForm({ columns, onSubmit }: IInsertFormProps) {
  const editableColumns = columns.filter((c) => Number(c.pk) === 0);
  const [values, setValues] = useState<Record<string, string>>({});

  function handleSubmit() {
    const nonEmpty = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''));
    onSubmit(nonEmpty);
    setValues({});
  }

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="overflow-hidden"
    >
      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface p-3">
        {editableColumns.map((col) => (
          <label key={col.name} className="flex flex-col gap-1 text-xs text-muted">
            {col.name}
            <input
              value={values[col.name] ?? ''}
              onChange={(event) => setValues((prev) => ({ ...prev, [col.name]: event.target.value }))}
              placeholder={col.type}
              className="w-40 rounded-md border border-line bg-surface-2 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
            />
          </label>
        ))}
        <button
          onClick={handleSubmit}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-strong"
        >
          Insert
        </button>
      </div>
    </motion.div>
  );
}
