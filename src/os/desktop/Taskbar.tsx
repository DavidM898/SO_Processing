import { useRef, useState } from 'react';
import { useWindows } from '../context/WindowContext';
import { useClock } from '../hooks/useClock';
import { APP_CATALOG, type WindowDef } from '../types';
import { StartMenu } from './StartMenu';
import './Taskbar.css';

function TaskbarButton({ win }: { win: WindowDef }) {
  const { focusWindow, minimizeWindow, restoreWindow, state } = useWindows();
  const isFocused = win.zIndex === state.topZ && !win.minimized;

  const handleClick = () => {
    if (win.minimized) {
      restoreWindow(win.id);
    } else if (isFocused) {
      minimizeWindow(win.id);
    } else {
      focusWindow(win.id);
    }
  };

  return (
    <button
      className={`taskbar-app-btn ${isFocused ? 'active' : ''} ${win.minimized ? 'minimized' : ''}`}
      onClick={handleClick}
      title={win.title}
    >
      <span className="taskbar-app-icon">{APP_CATALOG[win.appId]?.icon ?? '🖥️'}</span>
      <span className="taskbar-app-title">{win.title}</span>
    </button>
  );
}

export function Taskbar() {
  const { state } = useWindows();
  const { time, date } = useClock();
  const [startOpen, setStartOpen] = useState(false);
  const startBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="taskbar">
      <button
        ref={startBtnRef}
        type="button"
        className={`taskbar-start ${startOpen ? 'active' : ''}`}
        aria-expanded={startOpen}
        aria-haspopup="menu"
        onClick={() => setStartOpen(o => !o)}
      >
        <span className="start-logo">⊞</span>
        <span className="start-label">urlOS</span>
      </button>
      <StartMenu
        open={startOpen}
        onClose={() => setStartOpen(false)}
        anchorRef={startBtnRef}
      />

      <div className="taskbar-apps">
        {state.windows.map(w => (
          <TaskbarButton key={w.id} win={w} />
        ))}
      </div>

      <div className="taskbar-tray">
        <div className="taskbar-clock">
          <div className="clock-time">{time}</div>
          <div className="clock-date">{date}</div>
        </div>
      </div>
    </div>
  );
}
