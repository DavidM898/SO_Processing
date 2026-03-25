import { useEffect } from 'react';
import { WindowProvider, useWindows } from '../context/WindowContext';
import { ProcessProvider, useProcesses } from '../context/ProcessContext';
import { WindowLayer } from '../window/WindowLayer';
import { Taskbar } from './Taskbar';
import { APP_DEFAULTS } from '../types';
import './Desktop.css';

function DesktopInner() {
  const { openApp } = useWindows();
  const { registerProcess } = useProcesses();

  // Auto-open Terminal on mount
  useEffect(() => {
    const def = APP_DEFAULTS['terminal'];
    const pid = registerProcess({
      name: def.processName,
      type: 'app',
      appId: 'terminal',
      cpuPercent: 2,
      memoryMB: 18,
      startedAt: Date.now(),
    });
    openApp('terminal', pid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="desktop">
      <WindowLayer />
      <Taskbar />
    </div>
  );
}

export function Desktop() {
  return (
    <ProcessProvider>
      <WindowProvider>
        <DesktopInner />
      </WindowProvider>
    </ProcessProvider>
  );
}
