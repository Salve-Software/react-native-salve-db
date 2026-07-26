import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Columns3 } from 'lucide-react';
import type { IColumnInfo, Row } from '../../types';
import type { IRowGridProps } from './types';
import { primaryKeyColumn } from './library';

function ConfirmButton({
  label,
  count,
  onConfirm,
  revealOnHover = false,
}: {
  label: string;
  count?: number;
  onConfirm: () => void;
  revealOnHover?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
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
      className={`rounded-md border border-danger/30 px-2 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/10 ${
        revealOnHover ? 'opacity-0 group-hover:opacity-100' : ''
      }`}
    >
      {label}
      {count !== undefined ? ` (${count})` : ''}
    </button>
  );
}

function ColumnsMenu({
  columns,
  hidden,
  onToggle,
}: {
  columns: IColumnInfo[];
  hidden: Set<string>;
  onToggle: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs text-muted transition-colors hover:border-line-strong hover:text-ink"
      >
        <Columns3 className="h-3.5 w-3.5" />
        Columns
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 z-10 mt-1 w-48 rounded-md border border-line bg-surface p-1 shadow-lg"
          >
            {columns.map((col) => (
              <label
                key={col.name}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-ink/80 hover:bg-white/5"
              >
                <input
                  type="checkbox"
                  checked={!hidden.has(col.name)}
                  onChange={() => onToggle(col.name)}
                  className="accent-accent"
                />
                <span className="truncate">{col.name}</span>
              </label>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function rowKey(row: Row, primaryKey: string | null, index: number): string {
  return primaryKey ? String(row[primaryKey]) : String(index);
}

export function RowGrid({
  columns,
  rows,
  page,
  hasNextPage,
  onNextPage,
  onPrevPage,
  onUpdateCell,
  onDeleteRow,
  onDeleteRows,
}: IRowGridProps) {
  const primaryKey = primaryKeyColumn(columns);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [pendingEdits, setPendingEdits] = useState<Record<string, Record<string, string>>>({});

  const visibleColumns = columns.filter((col) => !hiddenColumns.has(col.name));
  const dirtyCount = Object.values(pendingEdits).reduce((sum, edits) => sum + Object.keys(edits).length, 0);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedKeys.size > 0 && selectedKeys.size < rows.length;
    }
  }, [selectedKeys, rows.length]);

  function toggleColumn(name: string) {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function toggleRow(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelectedKeys((prev) =>
      prev.size === rows.length && rows.length > 0
        ? new Set()
        : new Set(rows.map((row, index) => rowKey(row, primaryKey, index)))
    );
  }

  function setPendingValue(key: string, column: string, original: unknown, newValue: string) {
    setPendingEdits((prev) => {
      const rowEdits = { ...(prev[key] ?? {}) };
      if (newValue === String(original ?? '')) {
        delete rowEdits[column];
      } else {
        rowEdits[column] = newValue;
      }
      const next = { ...prev };
      if (Object.keys(rowEdits).length === 0) delete next[key]; else next[key] = rowEdits;
      return next;
    });
  }

  function handleDiscard() {
    setPendingEdits({});
  }

  function handleSaveAll() {
    const updates: Promise<void>[] = [];
    rows.forEach((row, index) => {
      const key = rowKey(row, primaryKey, index);
      const edits = pendingEdits[key];
      if (!edits) return;
      Object.entries(edits).forEach(([column, value]) => {
        updates.push(Promise.resolve(onUpdateCell(row, column, value)));
      });
    });
    Promise.all(updates).then(() => setPendingEdits({}));
  }

  const selectedRows = rows.filter((row, index) => selectedKeys.has(rowKey(row, primaryKey, index)));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <ColumnsMenu columns={columns} hidden={hiddenColumns} onToggle={toggleColumn} />

        <div className="flex items-center gap-1 text-xs text-muted">
          <button
            onClick={onPrevPage}
            disabled={page === 0}
            aria-label="Previous page"
            className="rounded-md p-1 transition-colors hover:bg-white/5 hover:text-ink disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span>Page {page + 1}</span>
          <button
            onClick={onNextPage}
            disabled={!hasNextPage}
            aria-label="Next page"
            className="rounded-md p-1 transition-colors hover:bg-white/5 hover:text-ink disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {selectedKeys.size > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-between overflow-hidden rounded-md border border-line bg-surface-2 px-3 py-2 text-xs text-ink"
          >
            <span>{selectedKeys.size} selected</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setSelectedKeys(new Set())} className="text-muted hover:text-ink">
                Clear
              </button>
              <ConfirmButton
                label="Delete selected"
                count={selectedKeys.size}
                onConfirm={() => {
                  onDeleteRows(selectedRows);
                  setSelectedKeys(new Set());
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {dirtyCount > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-between overflow-hidden rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-ink"
          >
            <span>{dirtyCount} unsaved change{dirtyCount === 1 ? '' : 's'}</span>
            <div className="flex items-center gap-2">
              <button onClick={handleDiscard} className="text-muted hover:text-ink">
                Discard
              </button>
              <button
                onClick={handleSaveAll}
                className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-ink hover:bg-accent-strong"
              >
                Save changes
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {rows.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-sm text-muted">
          <span>No rows yet.</span>
          <span className="text-xs text-muted/70">Use "+ Insert row" to add the first one.</span>
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky top-0 w-8 border-b border-line bg-surface px-3 py-2">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    aria-label="Select all rows"
                    checked={rows.length > 0 && selectedKeys.size === rows.length}
                    onChange={toggleAll}
                    className="accent-accent"
                  />
                </th>
                {visibleColumns.map((col) => (
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
                  const key = rowKey(row, primaryKey, index);
                  const rowEdits = pendingEdits[key];
                  return (
                    <motion.tr
                      key={key}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="group border-b border-line last:border-0 hover:bg-white/[0.03]"
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Select row ${key}`}
                          checked={selectedKeys.has(key)}
                          onChange={() => toggleRow(key)}
                          className="accent-accent"
                        />
                      </td>
                      {visibleColumns.map((col) => {
                        const isPk = col.name === primaryKey;
                        const value = row[col.name];
                        const isDirty = rowEdits?.[col.name] !== undefined;
                        const displayValue = isDirty ? rowEdits![col.name] : value === null ? null : String(value);
                        return (
                          <td
                            key={col.name}
                            className={`whitespace-nowrap px-3 py-2 ${isPk ? 'text-muted' : 'cursor-text'} ${
                              isDirty ? 'bg-accent/15 shadow-[inset_0_0_0_1px_rgba(34,209,108,0.5)]' : ''
                            }`}
                            contentEditable={!isPk}
                            suppressContentEditableWarning
                            onInput={(event) => {
                              if (isPk) return;
                              const newValue = event.currentTarget.textContent ?? '';
                              setPendingValue(key, col.name, value, newValue);
                            }}
                          >
                            {displayValue === null ? <span className="italic text-muted/60">NULL</span> : displayValue}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1 text-right">
                        <ConfirmButton label="Delete" revealOnHover onConfirm={() => onDeleteRow(row)} />
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
