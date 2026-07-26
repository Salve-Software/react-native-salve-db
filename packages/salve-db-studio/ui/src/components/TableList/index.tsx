import { motion } from 'motion/react';
import type { ITableListProps } from './types';

export function TableList({ tables, currentTable, onSelect }: ITableListProps) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface py-3">
      <div className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        Tables{tables.length > 0 && <span className="text-muted/60"> ({tables.length})</span>}
      </div>

      <nav className="flex flex-col gap-0.5 overflow-y-auto px-2">
        {tables.map((name) => {
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
        })}

        {tables.length === 0 && <p className="px-3 py-2 text-xs text-muted">No tables yet.</p>}
      </nav>
    </aside>
  );
}
