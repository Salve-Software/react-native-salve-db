import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { IColumnInfo, Row } from '../types';

interface IRowGridProps {
  columns: IColumnInfo[];
  rows: Row[];
  onUpdateCell: (row: Row, column: string, value: string) => void;
  onDeleteRow: (row: Row) => void;
}

function DeleteButton({ onConfirm }: { onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  if (confirming) {
    return (
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={() => {
            onConfirm();
            setConfirming(false);
          }}
          className="rounded-md bg-danger px-2 py-1 text-xs font-medium text-canvas"
        >
          Confirm
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setConfirming(true);
        timerRef.current = setTimeout(() => setConfirming(false), 3000);
      }}
      className="rounded-md px-2 py-1 text-xs font-medium text-danger/80 opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
    >
      Delete
    </button>
  );
}

export function RowGrid({ columns, rows, onUpdateCell, onDeleteRow }: IRowGridProps) {
  const primaryKey = columns.find((c) => Number(c.pk) > 0)?.name ?? null;

  if (rows.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-sm text-muted">
        <span>No rows yet.</span>
        <span className="text-xs text-muted/70">Use "+ Insert row" to add the first one.</span>
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.name}
                className="sticky top-0 border-b border-line bg-surface px-3 py-2 text-left font-medium text-muted"
              >
                {col.name}
              </th>
            ))}
            <th className="sticky top-0 border-b border-line bg-surface" />
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {rows.map((row, index) => {
              const key = primaryKey ? String(row[primaryKey]) : index;
              return (
                <motion.tr
                  key={key}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="group border-b border-line last:border-0 hover:bg-white/[0.03]"
                >
                  {columns.map((col) => {
                    const isPk = col.name === primaryKey;
                    const value = row[col.name];
                    return (
                      <td
                        key={col.name}
                        className={`whitespace-nowrap px-3 py-2 ${isPk ? 'text-muted' : 'cursor-text'}`}
                        contentEditable={!isPk}
                        suppressContentEditableWarning
                        onBlur={(event) => {
                          if (isPk) return;
                          const newValue = event.currentTarget.textContent ?? '';
                          if (newValue === String(value ?? '')) return;
                          onUpdateCell(row, col.name, newValue);
                        }}
                      >
                        {value === null ? <span className="italic text-muted/60">NULL</span> : String(value)}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-right">
                    <DeleteButton onConfirm={() => onDeleteRow(row)} />
                  </td>
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}
