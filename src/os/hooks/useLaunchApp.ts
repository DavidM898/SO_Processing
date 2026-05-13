import { useCallback } from 'react';
import { useWindows } from '../context/WindowContext';
import { useProcesses } from '../context/ProcessContext';
import { APP_DEFAULTS, type AppId } from '../types';

/** Abre la app o enfoca su ventana si ya está abierta (misma lógica que la terminal). */
export function useLaunchApp() {
  const { openApp, getWindowByAppId } = useWindows();
  const { registerProcess } = useProcesses();

  return useCallback(
    (appId: AppId) => {
      const existing = getWindowByAppId(appId);
      if (existing) {
        openApp(appId, existing.pid);
        return;
      }
      const def = APP_DEFAULTS[appId];
      const pid = registerProcess({
        name: def.processName,
        type: 'app',
        appId,
        cpuPercent: 3,
        memoryMB: Math.round(20 + Math.random() * 40),
        startedAt: Date.now(),
      });
      openApp(appId, pid);
    },
    [openApp, getWindowByAppId, registerProcess],
  );
}
