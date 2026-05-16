import type {
  CpuSchedulerConfig,
  CpuSnapshot,
  CpuSnapshotPcb,
  PCB,
  Phase,
  SchedulingEvent,
  SchedulingKind,
} from './types';

function clonePcbLite(p: PCB): CpuSnapshotPcb {
  const ph = p.phases[p.phaseIndex];
  const phaseKind = ph?.kind ?? 'CPU';
  const cpuBurstRemaining =
    p.state !== 'TERMINATED' && phaseKind === 'CPU' ? p.remainingInPhase : 0;
  return {
    pid: p.pid,
    name: p.name,
    state: p.state,
    priority: p.priority,
    phaseKind,
    remainingInPhase: p.remainingInPhase,
    phaseIndex: p.phaseIndex,
    cpuBurstRemaining,
    arrivalTime: p.arrivalTime,
  };
}

/** Ráfaga CPU restante del tramo actual; si la fase actual no es CPU, siguiente tramo CPU o 0. */
function cpuBurstRemainingFor(p: PCB): number {
  const ph = p.phases[p.phaseIndex];
  if (!ph) return 0;
  if (ph.kind === 'CPU') return p.remainingInPhase;
  return 0;
}

/** Suma de duraciones CPU restantes (fase actual si CPU + fases CPU posteriores). */
function totalCpuRemaining(p: PCB): number {
  let sum = 0;
  for (let i = p.phaseIndex; i < p.phases.length; i++) {
    const ph = p.phases[i];
    if (ph.kind !== 'CPU') continue;
    sum += i === p.phaseIndex ? p.remainingInPhase : ph.duration;
  }
  return sum;
}

export class CpuSchedulerSimulation {
  nowTick = 0;
  policy: SchedulingKind = 'FCFS';
  quantum = 5;
  priorityPreemptive = true;

  pending: PCB[] = [];
  ready: PCB[] = [];
  running: PCB | null = null;
  waiting: PCB[] = [];
  terminated: PCB[] = [];

  nextPid = 1;
  /** Ticks con CPU ocupada (para utilización). */
  cpuBusyTicks = 0;
  /** Últimos eventos de Gantt (CPU por tick). */
  private gantt: { tick: number; pid: number }[] = [];
  private readonly ganttMax = 120;
  /** Evita registrar CPU e idle en el mismo tick. */
  private ganttRecordedThisTick = false;

  private rng: () => number;

  constructor(seed?: number) {
    this.rng = seed !== undefined ? mulberry32(seed) : Math.random;
  }

  configure(partial: Partial<CpuSchedulerConfig>): void {
    if (partial.policy !== undefined) this.policy = partial.policy;
    if (partial.quantum !== undefined) this.quantum = Math.max(1, Math.floor(partial.quantum));
    if (partial.priorityPreemptive !== undefined) this.priorityPreemptive = partial.priorityPreemptive;
  }

  reset(): void {
    this.nowTick = 0;
    this.pending = [];
    this.ready = [];
    this.running = null;
    this.waiting = [];
    this.terminated = [];
    this.nextPid = 1;
    this.cpuBusyTicks = 0;
    this.gantt = [];
  }

  /**
   * Crea un proceso en NEW. La primera fase debe ser CPU (restricción didáctica).
   */
  spawn(opts: {
    name?: string;
    arrivalTime?: number;
    phases: Phase[];
    priority?: number;
  }): PCB {
    if (!opts.phases.length || opts.phases[0].kind !== 'CPU') {
      throw new Error('CpuSchedulerSimulation.spawn: la primera fase debe ser CPU.');
    }
    const pid = this.nextPid++;
    const arrivalTime = opts.arrivalTime ?? this.nowTick;
    const p: PCB = {
      pid,
      name: opts.name ?? `P${pid}`,
      state: 'NEW',
      arrivalTime,
      phases: opts.phases.map((ph) => ({ ...ph, duration: Math.max(1, Math.floor(ph.duration)) })),
      phaseIndex: 0,
      remainingInPhase: Math.max(1, Math.floor(opts.phases[0].duration)),
      priority: opts.priority ?? 0,
      waitInReadyTicks: 0,
      waitInIoTicks: 0,
      quantumUsedInBurst: 0,
      finishedAt: null,
    };
    this.pending.push(p);
    return p;
  }

  /** Proceso demo: CPU, I/O, CPU (posible estado WAITING). */
  spawnRandomDemo(): PCB {
    const cpu1 = 2 + Math.floor(this.rng() * 6);
    const io = 2 + Math.floor(this.rng() * 4);
    const cpu2 = 2 + Math.floor(this.rng() * 5);
    const priority = Math.floor(this.rng() * 5);
    return this.spawn({
      phases: [
        { kind: 'CPU', duration: cpu1 },
        { kind: 'IO', duration: io },
        { kind: 'CPU', duration: cpu2 },
      ],
      priority,
    });
  }

  /** Un tick simulado: admisiones, I/O, preemptión, despacho, una unidad de CPU. */
  step(): SchedulingEvent[] {
    const events: SchedulingEvent[] = [];
    const T = this.nowTick;

    this.ganttRecordedThisTick = false;

    this.tickWaitCounters();
    this.admitProcesses(events, T);
    this.tickIo(events);

    this.tryPreempt(events);
    this.dispatchIfIdle(events);

    this.executeCpuUnit(events);

    if (!this.ganttRecordedThisTick) {
      this.gantt.push({ tick: T, pid: -1 });
      if (this.gantt.length > this.ganttMax * 2) this.gantt.splice(0, this.gantt.length - this.ganttMax);
    }

    this.nowTick++;
    return events;
  }

  /** Avanza varios ticks (útil para acelerar la animación). */
  advance(n: number): SchedulingEvent[] {
    const all: SchedulingEvent[] = [];
    for (let i = 0; i < n; i++) all.push(...this.step());
    return all;
  }

  getSnapshot(): CpuSnapshot {
    const pendingNew = this.pending
      .filter((p) => p.state === 'NEW' && p.arrivalTime > this.nowTick)
      .map(clonePcbLite);
    const metrics = this.computeMetrics();
    return {
      nowTick: this.nowTick,
      policy: this.policy,
      quantum: this.quantum,
      priorityPreemptive: this.priorityPreemptive,
      running: this.running ? clonePcbLite(this.running) : null,
      ready: this.ready.map(clonePcbLite),
      waiting: this.waiting.map(clonePcbLite),
      terminated: this.terminated.map(clonePcbLite),
      pendingNew,
      ganttRecent: this.gantt.slice(-this.ganttMax),
      metrics,
    };
  }

  private computeMetrics(): CpuSnapshot['metrics'] {
    const n = this.terminated.length;
    if (n === 0) {
      return {
        avgTurnaround: null,
        avgWait: null,
        cpuUtilization: this.nowTick > 0 ? this.cpuBusyTicks / this.nowTick : 0,
        terminatedCount: 0,
      };
    }
    let sumT = 0;
    let sumW = 0;
    for (const p of this.terminated) {
      const fin = p.finishedAt ?? this.nowTick;
      sumT += fin - p.arrivalTime;
      sumW += p.waitInReadyTicks;
    }
    return {
      avgTurnaround: sumT / n,
      avgWait: sumW / n,
      cpuUtilization: this.nowTick > 0 ? this.cpuBusyTicks / this.nowTick : 0,
      terminatedCount: n,
    };
  }

  private tickWaitCounters(): void {
    for (const p of this.ready) p.waitInReadyTicks++;
    for (const p of this.waiting) p.waitInIoTicks++;
  }

  private admitProcesses(events: SchedulingEvent[], T: number): void {
    const stay: PCB[] = [];
    for (const p of this.pending) {
      if (p.state === 'NEW' && p.arrivalTime <= T) {
        p.state = 'READY';
        this.enqueueReady(p);
        events.push({ type: 'ADMIT', pid: p.pid, tick: T });
      } else {
        stay.push(p);
      }
    }
    this.pending = stay;
  }

  /**
   * Orden al entrar a listos: FCFS/RR mantienen orden FIFO por llegada a READY.
   * SJF/SRTF/PRIORITY mantienen lista ordenada para visualización coherente con el despacho.
   */
  private enqueueReady(p: PCB): void {
    this.ready.push(p);
    this.sortReadyForPolicy();
  }

  private sortReadyForPolicy(): void {
    switch (this.policy) {
      case 'FCFS':
      case 'RR':
        break;
      case 'SJF':
      case 'SRTF':
        this.ready.sort((a, b) => {
          const ra = cpuBurstRemainingFor(a);
          const rb = cpuBurstRemainingFor(b);
          if (ra !== rb) return ra - rb;
          return a.pid - b.pid;
        });
        break;
      case 'PRIORITY_NP':
      case 'PRIORITY_P':
        this.ready.sort((a, b) => {
          if (b.priority !== a.priority) return b.priority - a.priority;
          return a.pid - b.pid;
        });
        break;
      default:
        break;
    }
  }

  private pickReadyIndexForDispatch(): number {
    if (this.ready.length === 0) return -1;
    switch (this.policy) {
      case 'FCFS':
      case 'RR':
        return 0;
      case 'SJF': {
        let best = 0;
        let bestRem = cpuBurstRemainingFor(this.ready[0]);
        for (let i = 1; i < this.ready.length; i++) {
          const r = cpuBurstRemainingFor(this.ready[i]);
          if (r < bestRem || (r === bestRem && this.ready[i].pid < this.ready[best].pid)) {
            best = i;
            bestRem = r;
          }
        }
        return best;
      }
      case 'SRTF': {
        let best = 0;
        let bestRem = totalCpuRemaining(this.ready[0]);
        for (let i = 1; i < this.ready.length; i++) {
          const r = totalCpuRemaining(this.ready[i]);
          if (r < bestRem || (r === bestRem && this.ready[i].pid < this.ready[best].pid)) {
            best = i;
            bestRem = r;
          }
        }
        return best;
      }
      case 'PRIORITY_NP':
      case 'PRIORITY_P': {
        let best = 0;
        for (let i = 1; i < this.ready.length; i++) {
          const a = this.ready[best];
          const b = this.ready[i];
          if (b.priority > a.priority || (b.priority === a.priority && b.pid < a.pid)) best = i;
        }
        return best;
      }
      default:
        return 0;
    }
  }

  private removeReadyAt(idx: number): PCB {
    const [p] = this.ready.splice(idx, 1);
    return p;
  }

  private tickIo(events: SchedulingEvent[]): void {
    for (const p of [...this.waiting]) {
      p.remainingInPhase--;
      if (p.remainingInPhase > 0) continue;
      // Fase I/O terminada
      const idx = this.waiting.indexOf(p);
      if (idx !== -1) this.waiting.splice(idx, 1);
      p.phaseIndex++;
      events.push({ type: 'IO_DONE', pid: p.pid, tick: this.nowTick });
      if (p.phaseIndex >= p.phases.length) {
        this.finishProcess(p, events);
      } else {
        const next = p.phases[p.phaseIndex];
        p.remainingInPhase = next.duration;
        if (next.kind === 'CPU') {
          p.state = 'READY';
          this.enqueueReady(p);
        } else {
          p.state = 'WAITING';
          this.waiting.push(p);
          events.push({ type: 'IO_START', pid: p.pid, tick: this.nowTick });
        }
      }
    }
    this.tryPreempt(events);
    this.dispatchIfIdle(events);
  }

  /**
   * SRTF: expropia si algún listo tiene tiempo CPU restante total estrictamente menor que el del RUNNING.
   * PRIORITY_P: si priorityPreemptive y existe listo con prioridad estrictamente mayor.
   */
  private tryPreempt(events: SchedulingEvent[]): void {
    if (!this.running) return;
    const run = this.running;
    if (run.state !== 'RUNNING') return;

    if (this.policy === 'SRTF') {
      const runRem = totalCpuRemaining(run);
      let bestIdx = -1;
      let bestRem = Infinity;
      for (let i = 0; i < this.ready.length; i++) {
        const r = totalCpuRemaining(this.ready[i]);
        if (r >= runRem) continue;
        if (
          bestIdx === -1 ||
          r < bestRem ||
          (r === bestRem && this.ready[i].pid < this.ready[bestIdx].pid)
        ) {
          bestRem = r;
          bestIdx = i;
        }
      }
      if (bestIdx !== -1) {
        run.state = 'READY';
        this.enqueueReady(run);
        this.running = null;
        events.push({ type: 'PREEMPT', pid: run.pid, tick: this.nowTick, reason: 'SRTF' });
        this.sortReadyForPolicy();
      }
      return;
    }

    if (this.policy === 'PRIORITY_P' && this.priorityPreemptive) {
      let bestIdx = -1;
      for (let i = 0; i < this.ready.length; i++) {
        const rp = this.ready[i].priority;
        if (rp <= run.priority) continue;
        if (bestIdx === -1) bestIdx = i;
        else if (rp > this.ready[bestIdx].priority) bestIdx = i;
        else if (rp === this.ready[bestIdx].priority && this.ready[i].pid < this.ready[bestIdx].pid) bestIdx = i;
      }
      if (bestIdx !== -1) {
        run.state = 'READY';
        this.enqueueReady(run);
        this.running = null;
        events.push({ type: 'PREEMPT', pid: run.pid, tick: this.nowTick, reason: 'PRIORITY_P' });
        this.sortReadyForPolicy();
      }
    }
  }

  private dispatchIfIdle(events: SchedulingEvent[]): void {
    if (this.running) return;
    const idx = this.pickReadyIndexForDispatch();
    if (idx < 0) return;
    const p = this.removeReadyAt(idx);
    p.state = 'RUNNING';
    p.quantumUsedInBurst = 0;
    this.running = p;
    events.push({ type: 'DISPATCH', pid: p.pid, tick: this.nowTick });
  }

  private executeCpuUnit(events: SchedulingEvent[]): void {
    if (!this.running) return;
    const p = this.running;
    const ph = p.phases[p.phaseIndex];
    if (ph.kind !== 'CPU') return;

    p.remainingInPhase--;
    p.quantumUsedInBurst++;
    this.cpuBusyTicks++;
    this.recordGantt(p.pid);
    this.ganttRecordedThisTick = true;

    if (p.remainingInPhase <= 0) {
      p.phaseIndex++;
      if (p.phaseIndex >= p.phases.length) {
        this.running = null;
        this.finishProcess(p, events);
        this.dispatchIfIdle(events);
        return;
      }
      const next = p.phases[p.phaseIndex];
      p.remainingInPhase = next.duration;
      if (next.kind === 'IO') {
        p.state = 'WAITING';
        this.running = null;
        this.waiting.push(p);
        events.push({ type: 'IO_START', pid: p.pid, tick: this.nowTick });
        this.dispatchIfIdle(events);
      } else {
        // Siguiente CPU sin I/O intermedio: sigue en RUNNING
        p.quantumUsedInBurst = 0;
      }
      return;
    }

    // RR: agotó quantum dentro de la misma ráfaga CPU
    if (this.policy === 'RR' && p.quantumUsedInBurst >= this.quantum) {
      p.state = 'READY';
      p.quantumUsedInBurst = 0;
      this.running = null;
      this.enqueueReady(p);
      events.push({ type: 'PREEMPT', pid: p.pid, tick: this.nowTick, reason: 'RR_QUANTUM' });
      this.dispatchIfIdle(events);
    }
  }

  private finishProcess(p: PCB, events: SchedulingEvent[]): void {
    p.state = 'TERMINATED';
    p.finishedAt = this.nowTick;
    this.terminated.push(p);
    if (this.running === p) this.running = null;
    events.push({ type: 'TERMINATE', pid: p.pid, tick: this.nowTick });
  }

  private recordGantt(pid: number): void {
    this.gantt.push({ tick: this.nowTick, pid });
    if (this.gantt.length > this.ganttMax * 2) this.gantt.splice(0, this.gantt.length - this.ganttMax);
  }
}

function mulberry32(a: number): () => number {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
