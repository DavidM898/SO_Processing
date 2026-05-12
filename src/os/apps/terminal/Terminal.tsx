import { useState, useRef, useEffect, useCallback } from 'react';
import { useWindows } from '../../context/WindowContext';
import { useProcesses } from '../../context/ProcessContext';
import { APP_DEFAULTS, type AppId } from '../../types';
import './Terminal.css';

interface HistoryEntry {
  type: 'input' | 'output' | 'error' | 'banner';
  text: string;
}

type CommandResult =
  | { kind: 'text'; lines: string[] }
  | { kind: 'open_app'; appId: AppId }
  | { kind: 'clear' }
  | { kind: 'error'; message: string };

const HELP_TEXT = [
  '╔══════════════════════════════════════════╗',
  '║         urlOS Terminal  v1.0.0           ║',
  '╚══════════════════════════════════════════╝',
  '',
  '  Comandos disponibles:',
  '  ─────────────────────────────────────────',
  '  ayuda         Muestra esta ayuda',
  '  procesos      Abre el Administrador de Tareas',
  '  calculadora   Abre la Calculadora',
  '  archivos      Abre el Explorador de Archivos',
  '  abrir juego   Abre el Simulador de Concurrencia',
  '  cls / clear   Limpia la terminal',
  '  ─────────────────────────────────────────',
];

const BANNER = [
  ' _   _ ____  _     ___  ____',
  '| | | |  _ \\| |   / _ \\/ ___|',
  '| | | | |_) | |  | | | \\___ \\',
  '| |_| |  _ <| |__| |_| |___) |',
  ' \\___/|_| \\_\\_____\\___/|____/',
  '',
  'urlOS  1.0.0  —  Sistemas Operativos',
  'Escribe  ayuda  para ver los comandos.',
  '',
];

function executeCommand(raw: string): CommandResult {
  const cmd = raw.trim().toLowerCase();
  if (cmd === 'ayuda' || cmd === 'help') {
    return { kind: 'text', lines: HELP_TEXT };
  }
  if (cmd === 'procesos') {
    return { kind: 'open_app', appId: 'processmanager' };
  }
  if (cmd === 'calculadora') {
    return { kind: 'open_app', appId: 'calculator' };
  }
  if (cmd === 'archivos') {
    return { kind: 'open_app', appId: 'filemanager' };
  }
  if (cmd === 'abrir juego') {
    return { kind: 'open_app', appId: 'game' };
  }
  if (cmd === 'cls' || cmd === 'clear') {
    return { kind: 'clear' };
  }
  if (cmd === '') {
    return { kind: 'text', lines: [] };
  }
  return { kind: 'error', message: `'${raw.trim()}' no se reconoce como un comando. Escribe ayuda.` };
}

export function Terminal() {
  const { openApp, getWindowByAppId } = useWindows();
  const { registerProcess } = useProcesses();
  const [history, setHistory] = useState<HistoryEntry[]>(() =>
    BANNER.map(t => ({ type: 'banner' as const, text: t })),
  );
  const [input, setInput] = useState('');
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // Auto-focus
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const openOrFocusApp = useCallback((appId: AppId) => {
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
  }, [openApp, getWindowByAppId, registerProcess]);

  const submit = () => {
    const raw = input;
    setInput('');
    setHistoryIdx(-1);

    const inputEntry: HistoryEntry = { type: 'input', text: raw };

    const result = executeCommand(raw);

    if (result.kind === 'clear') {
      setHistory([]);
      return;
    }

    if (result.kind === 'open_app') {
      openOrFocusApp(result.appId);
      setHistory(h => [
        ...h,
        inputEntry,
        { type: 'output', text: `Abriendo ${APP_DEFAULTS[result.appId].title}…` },
      ]);
    } else if (result.kind === 'text') {
      setHistory(h => [
        ...h,
        inputEntry,
        ...result.lines.map(t => ({ type: 'output' as const, text: t })),
      ]);
    } else {
      setHistory(h => [
        ...h,
        inputEntry,
        { type: 'error', text: result.message },
      ]);
    }

    if (raw.trim()) {
      setCmdHistory(h => [raw, ...h.slice(0, 49)]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      submit();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(historyIdx + 1, cmdHistory.length - 1);
      setHistoryIdx(next);
      setInput(cmdHistory[next] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = historyIdx - 1;
      if (next < 0) {
        setHistoryIdx(-1);
        setInput('');
      } else {
        setHistoryIdx(next);
        setInput(cmdHistory[next] ?? '');
      }
    }
  };

  return (
    <div className="terminal" onClick={() => inputRef.current?.focus()}>
      <div className="terminal-output">
        {history.map((entry, i) => (
          <div key={i} className={`terminal-line terminal-${entry.type}`}>
            {entry.type === 'input' && <span className="terminal-prompt">C:\urlOS&gt; </span>}
            <span>{entry.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="terminal-input-row">
        <span className="terminal-prompt">C:\urlOS&gt; </span>
        <input
          ref={inputRef}
          className="terminal-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
        />
      </div>
    </div>
  );
}
