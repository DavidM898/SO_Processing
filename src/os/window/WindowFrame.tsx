import { useRef, lazy, Suspense } from 'react';
import type { WindowDef, AppId } from '../types';
import { APP_CATALOG } from '../types';
import { useWindows } from '../context/WindowContext';
import { useProcesses } from '../context/ProcessContext';
import './WindowFrame.css';

// Lazy-load each app to avoid circular imports and improve initial load
const Terminal       = lazy(() => import('../apps/terminal/Terminal').then(m => ({ default: m.Terminal })));
const ProcessManager = lazy(() => import('../apps/processmanager/ProcessManager').then(m => ({ default: m.ProcessManager })));
const Calculator     = lazy(() => import('../apps/calculator/Calculator').then(m => ({ default: m.Calculator })));
const FileManager    = lazy(() => import('../apps/filemanager/FileManager').then(m => ({ default: m.FileManager })));
const GameWindow     = lazy(() => import('../apps/game/GameWindow').then(m => ({ default: m.GameWindow })));
const TextEditor     = lazy(() => import('../apps/texteditor/TextEditor').then(m => ({ default: m.TextEditor })));

const APP_COMPONENTS: Record<AppId, React.ComponentType> = {
  terminal:       Terminal,
  processmanager: ProcessManager,
  calculator:     Calculator,
  filemanager:    FileManager,
  game:           GameWindow,
  texteditor:     TextEditor,
};

interface WindowFrameProps {
  win: WindowDef;
}

export function WindowFrame({ win }: WindowFrameProps) {
  const { closeWindow, minimizeWindow, maximizeWindow, focusWindow, moveWindow, state } = useWindows();
  const { unregisterProcess } = useProcesses();

  const dragState = useRef<{ startMx: number; startMy: number; startWx: number; startWy: number } | null>(null);
  const isFocused = win.zIndex === state.topZ;

  const AppComponent = APP_COMPONENTS[win.appId];

  const handleTitleBarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (win.maximized || e.button !== 0) return;
    e.preventDefault();
    focusWindow(win.id);
    dragState.current = { startMx: e.clientX, startMy: e.clientY, startWx: win.x, startWy: win.y };
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      if (!dragState.current) return;
      const dx = ev.clientX - dragState.current.startMx;
      const dy = ev.clientY - dragState.current.startMy;
      moveWindow(win.id, dragState.current.startWx + dx, dragState.current.startWy + dy);
    };

    const onUp = () => {
      dragState.current = null;
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    unregisterProcess(win.pid);
    closeWindow(win.id);
  };

  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    minimizeWindow(win.id);
  };

  const handleMaximize = (e: React.MouseEvent) => {
    e.stopPropagation();
    maximizeWindow(win.id);
  };

  const frameStyle: React.CSSProperties = win.maximized
    ? { zIndex: win.zIndex }
    : {
        left: win.x,
        top: win.y,
        width: win.width,
        height: win.height,
        zIndex: win.zIndex,
      };

  return (
    <div
      className={`window-frame ${win.maximized ? 'maximized' : ''} ${isFocused ? 'focused' : ''}`}
      style={frameStyle}
      onPointerDown={() => focusWindow(win.id)}
    >
      {/* Title bar */}
      <div
        className={`window-titlebar ${isFocused ? 'focused' : ''}`}
        onPointerDown={handleTitleBarPointerDown}
        onDoubleClick={handleMaximize}
      >
        <span className="window-icon">{APP_CATALOG[win.appId].icon}</span>
        <span className="window-title">{win.title}</span>
        {/* Stop pointer events from bubbling to the drag handler so click events reach the buttons */}
        <div className="window-controls" onPointerDown={e => e.stopPropagation()}>
          <button className="win-btn win-minimize" onClick={handleMinimize} title="Minimizar">─</button>
          <button className="win-btn win-maximize" onClick={handleMaximize} title={win.maximized ? 'Restaurar' : 'Maximizar'}>
            {win.maximized ? '❐' : '□'}
          </button>
          <button className="win-btn win-close" onClick={handleClose} title="Cerrar">✕</button>
        </div>
      </div>

      {/* Content */}
      <div className="window-content">
        <Suspense fallback={<div className="window-loading">Cargando…</div>}>
          <AppComponent />
        </Suspense>
      </div>
    </div>
  );
}

