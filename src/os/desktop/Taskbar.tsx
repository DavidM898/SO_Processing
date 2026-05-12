import { useWindows } from '../context/WindowContext';
import { useClock } from '../hooks/useClock';
import type { WindowDef } from '../types';
import './Taskbar.css';

const APP_ICONS: Record<string, string> = {
  terminal:       '⬛',
  processmanager: '📊',
  calculator:     '🔢',
  filemanager:    '📁',
  game:           '🚗',
};

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
      <span className="taskbar-app-icon">{APP_ICONS[win.appId] ?? '🖥️'}</span>
      <span className="taskbar-app-title">{win.title}</span>
    </button>
  );
}

export function Taskbar() {
  const { state } = useWindows();
  const { time, date } = useClock();

  return (
    <div className="taskbar">
      <button className="taskbar-start">
        <span className="start-logo">⊞</span>
        <span className="start-label">urlOS</span>
      </button>

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
