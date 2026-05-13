import { useEffect, useRef, type RefObject } from 'react';
import { APP_MENU_ORDER, APP_DEFAULTS, APP_CATALOG } from '../types';
import { useLaunchApp } from '../hooks/useLaunchApp';
import './StartMenu.css';

interface StartMenuProps {
  open: boolean;
  onClose: () => void;
  /** No cerrar al pulsar aquí (botón urlOS que también abre/cierra el menú). */
  anchorRef: RefObject<HTMLElement | null>;
}

export function StartMenu({ open, onClose, anchorRef }: StartMenuProps) {
  const launch = useLaunchApp();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="start-menu"
      role="menu"
      aria-label="Aplicaciones urlOS"
    >
      <div className="start-menu-header">Aplicaciones</div>
      <ul className="start-menu-list">
        {APP_MENU_ORDER.map(appId => {
          const meta = APP_CATALOG[appId];
          const def = APP_DEFAULTS[appId];
          return (
            <li key={appId}>
              <button
                type="button"
                role="menuitem"
                className="start-menu-item"
                onClick={() => {
                  launch(appId);
                  onClose();
                }}
              >
                <span className="start-menu-icon" aria-hidden>
                  {meta.icon}
                </span>
                <span className="start-menu-text">
                  <span className="start-menu-title">{def.title}</span>
                  <span className="start-menu-desc">{meta.description}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
