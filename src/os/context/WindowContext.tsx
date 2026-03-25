import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { AppId, WindowDef, WindowState, WindowAction } from '../types';
import { APP_DEFAULTS } from '../types';

function windowReducer(state: WindowState, action: WindowAction): WindowState {
  switch (action.type) {
    case 'OPEN': {
      // Single-instance: if app already open, just focus it
      const existing = state.windows.find(w => w.appId === action.appId);
      if (existing) {
        return windowReducer(state, { type: 'FOCUS', id: existing.id });
      }
      const newZ = state.topZ + 1;
      const availW = window.innerWidth;
      const availH = window.innerHeight - 40; // reserve taskbar
      const w = Math.min(action.defaultSize.w, availW - 16);
      const h = Math.min(action.defaultSize.h, availH - 16);
      const x = Math.max(0, Math.round((availW - w) / 2));
      const y = Math.max(0, Math.round((availH - h) / 2));
      const newWin: WindowDef = {
        id: crypto.randomUUID(),
        appId: action.appId,
        title: action.title,
        x,
        y,
        width: w,
        height: h,
        zIndex: newZ,
        minimized: false,
        maximized: false,
        pid: action.pid,
      };
      return { windows: [...state.windows, newWin], topZ: newZ };
    }
    case 'CLOSE':
      return { ...state, windows: state.windows.filter(w => w.id !== action.id) };
    case 'MINIMIZE':
      return {
        ...state,
        windows: state.windows.map(w =>
          w.id === action.id ? { ...w, minimized: true } : w,
        ),
      };
    case 'RESTORE': {
      const newZ = state.topZ + 1;
      return {
        windows: state.windows.map(w =>
          w.id === action.id ? { ...w, minimized: false, zIndex: newZ } : w,
        ),
        topZ: newZ,
      };
    }
    case 'MAXIMIZE': {
      const win = state.windows.find(w => w.id === action.id);
      if (!win) return state;
      if (win.maximized) {
        // Restore from maximized
        return {
          ...state,
          windows: state.windows.map(w =>
            w.id === action.id
              ? {
                  ...w,
                  maximized: false,
                  x: w.prevBounds?.x ?? w.x,
                  y: w.prevBounds?.y ?? w.y,
                  width: w.prevBounds?.width ?? w.width,
                  height: w.prevBounds?.height ?? w.height,
                  prevBounds: undefined,
                }
              : w,
          ),
        };
      }
      return {
        ...state,
        windows: state.windows.map(w =>
          w.id === action.id
            ? {
                ...w,
                maximized: true,
                prevBounds: { x: w.x, y: w.y, width: w.width, height: w.height },
              }
            : w,
        ),
      };
    }
    case 'FOCUS': {
      const newZ = state.topZ + 1;
      return {
        windows: state.windows.map(w =>
          w.id === action.id ? { ...w, zIndex: newZ, minimized: false } : w,
        ),
        topZ: newZ,
      };
    }
    case 'MOVE':
      return {
        ...state,
        windows: state.windows.map(w =>
          w.id === action.id ? { ...w, x: action.x, y: action.y } : w,
        ),
      };
    default:
      return state;
  }
}

interface WindowContextValue {
  state: WindowState;
  openApp: (appId: AppId, pid: number) => void;
  closeWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  getWindowByAppId: (appId: AppId) => WindowDef | undefined;
}

const WindowContext = createContext<WindowContextValue | null>(null);

const INITIAL_STATE: WindowState = { windows: [], topZ: 10 };

export function WindowProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(windowReducer, INITIAL_STATE);

  const openApp = (appId: AppId, pid: number) => {
    const def = APP_DEFAULTS[appId];
    dispatch({ type: 'OPEN', appId, title: def.title, defaultSize: { w: def.w, h: def.h }, pid });
  };

  const closeWindow   = (id: string) => dispatch({ type: 'CLOSE', id });
  const minimizeWindow = (id: string) => dispatch({ type: 'MINIMIZE', id });
  const restoreWindow  = (id: string) => dispatch({ type: 'RESTORE', id });
  const maximizeWindow = (id: string) => dispatch({ type: 'MAXIMIZE', id });
  const focusWindow    = (id: string) => dispatch({ type: 'FOCUS', id });
  const moveWindow     = (id: string, x: number, y: number) => dispatch({ type: 'MOVE', id, x, y });
  const getWindowByAppId = (appId: AppId) => state.windows.find(w => w.appId === appId);

  return (
    <WindowContext.Provider value={{
      state, openApp, closeWindow, minimizeWindow, restoreWindow,
      maximizeWindow, focusWindow, moveWindow, getWindowByAppId,
    }}>
      {children}
    </WindowContext.Provider>
  );
}

export function useWindows() {
  const ctx = useContext(WindowContext);
  if (!ctx) throw new Error('useWindows must be used inside WindowProvider');
  return ctx;
}
