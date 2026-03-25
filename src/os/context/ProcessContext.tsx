import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  type ReactNode,
} from 'react';
import type { OSProcess, ProcessState, ProcessAction } from '../types';

const CPU_HISTORY_MAX = 60;

const SYSTEM_PROCESSES: OSProcess[] = [
  { pid: 1,  name: 'System Idle',       type: 'system', cpuPercent: 40, memoryMB: 2,   startedAt: Date.now() },
  { pid: 2,  name: 'urlOS Kernel',      type: 'system', cpuPercent: 3,  memoryMB: 48,  startedAt: Date.now() },
  { pid: 3,  name: 'urlOS Shell',       type: 'system', cpuPercent: 2,  memoryMB: 22,  startedAt: Date.now() },
  { pid: 4,  name: 'urlOS Renderer',    type: 'system', cpuPercent: 8,  memoryMB: 85,  startedAt: Date.now() },
  { pid: 5,  name: 'Network Daemon',    type: 'system', cpuPercent: 1,  memoryMB: 12,  startedAt: Date.now() },
  { pid: 6,  name: 'Security Monitor',  type: 'system', cpuPercent: 1,  memoryMB: 9,   startedAt: Date.now() },
];

const INITIAL_STATE: ProcessState = {
  processes: SYSTEM_PROCESSES,
  cpuHistory: new Array(CPU_HISTORY_MAX).fill(0),
  nextPid: 100,
};

function nudge(val: number, min: number, max: number): number {
  const delta = (Math.random() - 0.5) * 10;
  return Math.max(min, Math.min(max, val + delta));
}

function processReducer(state: ProcessState, action: ProcessAction): ProcessState {
  switch (action.type) {
    case 'REGISTER': {
      const pid = state.nextPid;
      const newProcess: OSProcess = { ...action.process, pid };
      return {
        ...state,
        processes: [...state.processes, newProcess],
        nextPid: pid + 1,
      };
    }
    case 'UNREGISTER':
      return {
        ...state,
        processes: state.processes.filter(p => p.pid !== action.pid),
      };
    case 'TICK': {
      const updated = state.processes.map(p => ({
        ...p,
        cpuPercent: p.type === 'system'
          ? nudge(p.cpuPercent, 0, p.pid === 1 ? 60 : 15)
          : nudge(p.cpuPercent, 0, 30),
      }));
      const total = Math.min(100, updated.reduce((s, p) => s + p.cpuPercent, 0));
      const history = [...state.cpuHistory.slice(1), Math.round(total)];
      return { ...state, processes: updated, cpuHistory: history };
    }
    default:
      return state;
  }
}

interface ProcessContextValue {
  state: ProcessState;
  registerProcess: (data: Omit<OSProcess, 'pid'>) => number;
  unregisterProcess: (pid: number) => void;
}

const ProcessContext = createContext<ProcessContextValue | null>(null);

export function ProcessProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(processReducer, INITIAL_STATE);

  useEffect(() => {
    const id = setInterval(() => dispatch({ type: 'TICK' }), 1000);
    return () => clearInterval(id);
  }, []);

  // We need a ref to get the next pid synchronously before dispatch settles
  const nextPidRef = { current: state.nextPid };
  nextPidRef.current = state.nextPid;

  const registerProcess = (data: Omit<OSProcess, 'pid'>): number => {
    const pid = nextPidRef.current;
    dispatch({ type: 'REGISTER', process: data });
    return pid;
  };

  const unregisterProcess = (pid: number) => dispatch({ type: 'UNREGISTER', pid });

  return (
    <ProcessContext.Provider value={{ state, registerProcess, unregisterProcess }}>
      {children}
    </ProcessContext.Provider>
  );
}

export function useProcesses() {
  const ctx = useContext(ProcessContext);
  if (!ctx) throw new Error('useProcesses must be used inside ProcessProvider');
  return ctx;
}
