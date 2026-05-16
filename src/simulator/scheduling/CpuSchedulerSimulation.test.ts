import { describe, expect, it } from 'vitest';
import { CpuSchedulerSimulation } from './CpuSchedulerSimulation';

describe('CpuSchedulerSimulation', () => {
  it('FCFS ejecuta en orden de llegada a listos (menor PID primero si mismo burst)', () => {
    const sim = new CpuSchedulerSimulation(42);
    sim.configure({ policy: 'FCFS', quantum: 99 });
    sim.spawn({ phases: [{ kind: 'CPU', duration: 2 }], arrivalTime: 0 });
    sim.spawn({ phases: [{ kind: 'CPU', duration: 3 }], arrivalTime: 0 });
    sim.advance(10);
    const snap = sim.getSnapshot();
    expect(snap.metrics.terminatedCount).toBe(2);
    expect(snap.terminated.map((t) => t.pid)).toEqual([1, 2]);
  });

  it('RR con quantum 2 parte una ráfaga de 5 en 2+2+1', () => {
    const sim = new CpuSchedulerSimulation(1);
    sim.configure({ policy: 'RR', quantum: 2 });
    sim.spawn({ phases: [{ kind: 'CPU', duration: 5 }], arrivalTime: 0 });
    sim.advance(20);
    const snap = sim.getSnapshot();
    expect(snap.metrics.terminatedCount).toBe(1);
    const g = snap.ganttRecent.filter((x) => x.pid === 1).length;
    expect(g).toBe(5);
  });

  it('SRTF expropia cuando llega un proceso con ráfaga total menor', () => {
    const sim = new CpuSchedulerSimulation(7);
    sim.configure({ policy: 'SRTF', quantum: 5 });
    sim.spawn({ phases: [{ kind: 'CPU', duration: 8 }], arrivalTime: 0 });
    sim.step();
    expect(sim.getSnapshot().running?.pid).toBe(1);
    sim.spawn({ phases: [{ kind: 'CPU', duration: 2 }], arrivalTime: sim.nowTick });
    sim.step();
    const s2 = sim.getSnapshot();
    expect(s2.running?.pid).toBe(2);
  });

  it('PRIORITY_P expropia si un listo tiene prioridad estrictamente mayor', () => {
    const sim = new CpuSchedulerSimulation(3);
    sim.configure({ policy: 'PRIORITY_P', quantum: 9, priorityPreemptive: true });
    sim.spawn({ phases: [{ kind: 'CPU', duration: 6 }], priority: 1, arrivalTime: 0 });
    sim.step();
    expect(sim.getSnapshot().running?.pid).toBe(1);
    sim.spawn({ phases: [{ kind: 'CPU', duration: 4 }], priority: 9, arrivalTime: sim.nowTick });
    sim.step();
    expect(sim.getSnapshot().running?.pid).toBe(2);
  });
});
