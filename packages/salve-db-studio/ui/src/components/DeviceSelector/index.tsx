import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Apple, Bot, ChevronDown, Smartphone } from 'lucide-react';
import type { IDeviceSelectorProps } from './types';

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  switch (platform.toLowerCase()) {
    case 'ios':
      return <Apple className={className} />;
    case 'android':
      return <Bot className={className} />;
    default:
      return <Smartphone className={className} />;
  }
}

export function DeviceSelector({ devices, selectedDeviceId, onSelect }: IDeviceSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (devices.length === 0) return null;

  const selected = devices.find((device) => device.id === selectedDeviceId) ?? devices[0]!;

  function handleSelect(id: string) {
    onSelect(id);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Select device"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink transition-colors hover:border-line-strong"
      >
        <PlatformIcon platform={selected.platform} className="h-3.5 w-3.5 text-muted" />
        <span>{selected.dbName || selected.platform}</span>
        {devices.length > 1 && <ChevronDown className="h-3 w-3 text-muted" />}
      </button>

      <AnimatePresence>
        {open && devices.length > 1 && (
          <motion.div
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 z-10 mt-1 w-48 overflow-hidden rounded-md border border-line bg-surface shadow-lg"
          >
            {devices.map((device) => (
              <button
                key={device.id}
                type="button"
                role="option"
                aria-selected={device.id === selected.id}
                onClick={() => handleSelect(device.id)}
                className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs transition-colors ${
                  device.id === selected.id ? 'bg-accent/15 text-accent-strong' : 'text-ink/80 hover:bg-white/5'
                }`}
              >
                <PlatformIcon platform={device.platform} className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{device.dbName || device.platform}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
