import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { ITableListProps } from './types';

function isSystemTable(name: string) {
  return name.startsWith('_');
}

export function TableList({ tables, currentTable, onSelect }: ITableListProps) {
  const [showSystem, setShowSystem] = useState(false);

  useEffect(() => {
    if (currentTable && isSystemTable(currentTable)) setShowSystem(true);
  }, [currentTable]);

  const userTables = tables.filter((name) => !isSystemTable(name));
  const systemTables = tables.filter(isSystemTable);

  function renderRow(name: string) {
    const active = name === currentTable;
    return (
      <button
        key={name}
        onClick={() => onSelect(name)}
        className={`relative rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
          active ? 'text-accent-strong' : 'text-ink/80 hover:bg-white/5'
        }`}
      >
        {active && (
          <motion.span
            layoutId="table-active-indicator"
            className="absolute inset-0 rounded-md bg-accent/15"
            transition={{ type: 'spring', stiffness: 500, damping: 40 }}
          />
        )}
        <span className="relative">{name}</span>
      </button>
    );
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface py-3">
      <div className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        Tables{userTables.length > 0 && <span className="text-muted/60"> ({userTables.length})</span>}
      </div>

      <nav className="flex flex-col gap-0.5 overflow-y-auto px-2">
        {userTables.map(renderRow)}

        {tables.length === 0 && <p className="px-3 py-2 text-xs text-muted">No tables yet.</p>}
      </nav>

      {systemTables.length > 0 && (
        <div className="mt-2 border-t border-line pt-2">
          <button
            onClick={() => setShowSystem((v) => !v)}
            className="flex w-full items-center gap-1.5 px-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted/70 transition-colors hover:text-muted"
          >
            <motion.span aria-hidden="true" animate={{ rotate: showSystem ? 90 : 0 }} transition={{ duration: 0.15 }}>
              ▸
            </motion.span>
            System <span className="text-muted/50">({systemTables.length})</span>
          </button>

          <AnimatePresence initial={false}>
            {showSystem && (
              <motion.nav
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col gap-0.5 overflow-hidden px-2"
              >
                {systemTables.map(renderRow)}
              </motion.nav>
            )}
          </AnimatePresence>
        </div>
      )}
    </aside>
  );
}
