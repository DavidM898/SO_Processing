/**
 * Simulación didáctica de un SO de un núcleo (no ejecuta procesos reales del navegador).
 * Convención de prioridad: número mayor = mayor prioridad. Empates: menor PID primero.
 */

export type SimProcessState = 'NEW' | 'READY' | 'RUNNING' | 'WAITING' | 'TERMINATED';

/** FCFS = FIFO en cola de listos. SJF = no expropiativo por ráfaga más corta al despachar. */
export type SchedulingKind = 'FCFS' | 'SJF' | 'SRTF' | 'RR' | 'PRIORITY_NP' | 'PRIORITY_P';

export interface Phase {
  kind: 'CPU' | 'IO';
  duration: number;
}

export interface PCB {
  pid: number;
  name: string;
  state: SimProcessState;
  /** Tick simulado en el que el proceso entra al sistema (NEW → READY cuando nowTick >= arrivalTime). */
  arrivalTime: number;
  phases: Phase[];
  phaseIndex: number;
  remainingInPhase: number;
  /** Mayor número = mayor prioridad (estilo Unix “nice” invertido didáctico). */
  priority: number;
  /** Ticks acumulados en cola de listos (métrica de espera). */
  waitInReadyTicks: number;
  /** Ticks en WAITING (I/O). */
  waitInIoTicks: number;
  /** Unidades de CPU ya servidas en el tramo actual (para RR: quantum dentro de la ráfaga). */
  quantumUsedInBurst: number;
  /** Tick en que pasó a TERMINATED (para turnaround). */
  finishedAt: number | null;
}

export type SchedulingEvent =
  | { type: 'ADMIT'; pid: number; tick: number }
  | { type: 'DISPATCH'; pid: number; tick: number }
  | { type: 'PREEMPT'; pid: number; tick: number; reason: string }
  | { type: 'IO_START'; pid: number; tick: number }
  | { type: 'IO_DONE'; pid: number; tick: number }
  | { type: 'TERMINATE'; pid: number; tick: number };

export interface CpuSnapshotPcb {
  pid: number;
  name: string;
  state: SimProcessState;
  priority: number;
  phaseKind: 'CPU' | 'IO';
  remainingInPhase: number;
  phaseIndex: number;
  /** Para procesos en NEW pendientes de admisión. */
  arrivalTime?: number;
  /** Ráfaga CPU restante del tramo actual (0 si no está en fase CPU). */
  cpuBurstRemaining: number;
}

export interface CpuSnapshot {
  nowTick: number;
  policy: SchedulingKind;
  quantum: number;
  /** Solo aplica cuando policy === PRIORITY_P. */
  priorityPreemptive: boolean;
  running: CpuSnapshotPcb | null;
  ready: CpuSnapshotPcb[];
  waiting: CpuSnapshotPcb[];
  terminated: CpuSnapshotPcb[];
  /** Procesos aún no admitidos (NEW con arrivalTime > nowTick). */
  pendingNew: CpuSnapshotPcb[];
  /** Últimos segmentos de CPU por tick (para mini-Gantt). pid -1 = ocioso. */
  ganttRecent: { tick: number; pid: number }[];
  metrics: {
    avgTurnaround: number | null;
    avgWait: number | null;
    /** runningTicks / max(1, nowTick) aproximación de utilización. */
    cpuUtilization: number;
    terminatedCount: number;
  };
}

export interface CpuSchedulerConfig {
  policy: SchedulingKind;
  quantum: number;
  /** Si true y policy es PRIORITY_P, un proceso listo con prioridad estrictamente mayor expropia al RUNNING. */
  priorityPreemptive: boolean;
}
