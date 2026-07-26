import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { RefreshCw, Terminal, X } from 'lucide-react';
import { useStudioConnection } from './hooks';
import {
  StatusBadge,
  DeviceSelector,
  TableList,
  TableSettingsModal,
  RowGrid,
  InsertForm,
  SqlRunner,
  Toast,
} from './components';

function ConnectingState() {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
      <motion.div
        className="h-3 w-3 rounded-full bg-accent"
        animate={{ scale: [1, 1.6, 1], opacity: [1, 0.4, 1] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <p className="text-sm text-ink">Waiting for your app to connect…</p>
      <p className="max-w-xs text-xs text-muted">
        Run your app in dev mode — the Studio agent starts automatically when{' '}
        <code className="rounded bg-surface-2 px-1 py-0.5 font-mono">__DEV__</code> is true.
      </p>
    </div>
  );
}

export function App() {
  const {
    appConnected,
    devices,
    selectedDeviceId,
    selectDevice,
    tables,
    currentTable,
    columns,
    rows,
    page,
    hasNextPage,
    nextPage,
    prevPage,
    error,
    clearError,
    selectTable,
    refresh,
    insertRow,
    updateCell,
    deleteRow,
    deleteRows,
    truncateTable,
    deleteTable,
    runSql,
  } = useStudioConnection();
  const [showInsertForm, setShowInsertForm] = useState(false);
  const [managingTable, setManagingTable] = useState<string | null>(null);
  const [showSqlRunner, setShowSqlRunner] = useState(false);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(clearError, 4000);
    return () => clearTimeout(timer);
  }, [error, clearError]);

  function handleSelect(name: string) {
    setShowInsertForm(false);
    selectTable(name);
  }

  function handleInsert(values: Record<string, string>) {
    insertRow(values);
    setShowInsertForm(false);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="brand-stripe h-[3px] shrink-0" />
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5">
        <span className="text-sm font-semibold tracking-tight">Salve DB Studio</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSqlRunner(true)}
            aria-label="Run SQL"
            className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs text-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            <Terminal className="h-3.5 w-3.5" />
            SQL
          </button>
          <DeviceSelector devices={devices} selectedDeviceId={selectedDeviceId} onSelect={selectDevice} />
          <StatusBadge connected={appConnected} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <TableList
          tables={tables}
          currentTable={currentTable}
          onSelect={handleSelect}
          onManage={setManagingTable}
        />

        <main className="flex-1 overflow-y-auto p-6">
          {!appConnected ? (
            <ConnectingState />
          ) : (
            <AnimatePresence mode="wait">
              {!currentTable ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex h-64 items-center justify-center text-sm text-muted"
                >
                  Select a table to browse its rows.
                </motion.div>
              ) : (
                <motion.div
                  key={currentTable}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="mb-3 flex items-center gap-3">
                    <h2 className="text-lg font-semibold">{currentTable}</h2>
                    <span className="text-xs text-muted">
                      {rows.length} row{rows.length === 1 ? '' : 's'}
                    </span>
                    <div className="ml-auto flex gap-2">
                      <button
                        onClick={refresh}
                        aria-label="Refresh"
                        className="rounded-md border border-line p-1.5 text-muted transition-colors hover:border-line-strong hover:text-ink"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setShowInsertForm((v) => !v)}
                        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-strong"
                      >
                        + Insert row
                      </button>
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {showInsertForm && <InsertForm key="insert" columns={columns} onSubmit={handleInsert} />}
                  </AnimatePresence>

                  <RowGrid
                    columns={columns}
                    rows={rows}
                    page={page}
                    hasNextPage={hasNextPage}
                    onNextPage={nextPage}
                    onPrevPage={prevPage}
                    onUpdateCell={updateCell}
                    onDeleteRow={deleteRow}
                    onDeleteRows={deleteRows}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </main>
      </div>

      <Toast message={error} onDismiss={clearError} />

      <TableSettingsModal
        table={managingTable}
        isSystem={managingTable?.startsWith('_') ?? false}
        onTruncate={truncateTable}
        onDelete={deleteTable}
        onClose={() => setManagingTable(null)}
      />

      <AnimatePresence>
        {showSqlRunner && (
          <div
            className="fixed inset-0 z-30 flex items-start justify-center bg-black/50 pt-24"
            onClick={() => setShowSqlRunner(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -8 }}
              transition={{ duration: 0.15 }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-2xl rounded-lg border border-line bg-surface p-4 shadow-xl"
            >
              <div className="mb-2 flex justify-end">
                <button
                  onClick={() => setShowSqlRunner(false)}
                  aria-label="Close"
                  className="text-muted transition-colors hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <SqlRunner runSql={runSql} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
