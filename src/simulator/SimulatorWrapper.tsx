import { useLayoutEffect, useRef, useCallback, useState } from 'react';
import p5 from 'p5';
import type { InstructionData } from './types';
import { W, H, COLORS } from './types';
import { SimMutex, SimSemaphore, SimMonitor } from './primitives';
import { Car, resetCarId } from './Car';
import {
  drawSceneBg,
  drawHRoad,
  drawVRoad,
  drawCrosswalks,
  drawTrafficLight,
  drawBarrier,
  drawParkingSign,
  drawDigitalBoard,
  drawWater,
  drawResourceGate,
  drawPanel,
  drawLabel,
  drawStatusChip,
  getParkedSlots,
  firstFreeSlot,
  getCarById,
  mutexLightStates,
} from './drawing';
import Controls from './Controls';
import './SimulatorWrapper.css';
import { CpuSchedulerSimulation } from './scheduling/CpuSchedulerSimulation';
import type { SchedulingKind } from './scheduling/types';

const M9_POLICIES: SchedulingKind[] = [
  'FCFS',
  'SJF',
  'SRTF',
  'RR',
  'PRIORITY_NP',
  'PRIORITY_P',
];
const M9_POLICY_LABELS = ['FCFS', 'SJF', 'SRTF', 'RR', 'Pri-NP', 'Pri-P'];

function m9ApplyPolicyFromIdx(
  cpu: CpuSchedulerSimulation,
  policyIdx: number,
  priPreempt: boolean,
): void {
  const pol = M9_POLICIES[policyIdx % M9_POLICIES.length];
  cpu.configure({
    policy: pol,
    quantum: cpu.quantum,
    priorityPreemptive: pol === 'PRIORITY_P' ? priPreempt : false,
  });
}

interface SimulatorState {
  currentMode: number;
  eventsLog: string[];
  selectedCar: Car | null;
  showInstructions: boolean;
  m1Cars: Car[];
  m1Collisions: number;
  m1Flash: number;
  m2Cars: Car[];
  m2Mutex: SimMutex;
  m3Cars: Car[];
  m3Mutex: SimMutex;
  m4Cars: Car[];
  m4Cap: number;
  m4Sem: SimSemaphore;
  m5Cars: Car[];
  m5Cap: number;
  m5Mon: SimMonitor;
  m6Cars: Car[];
  m6Mutex: SimMutex;
  m6Queue: Car[];
  m6Policy: number;
  m7Cars: Car[];
  m7RA: SimMutex;
  m7RB: SimMutex;
  m7Detected: boolean;
  m7Msg: string;
  m7Prevent: boolean;
  m8Cars: Car[];
  m8MutexInt: SimMutex;
  m8MutexBr: SimMutex;
  m8SemPark: SimSemaphore;
  m8NextDest: string;
  /** Simulación de PCB / planificación (modo 9). */
  m9Cpu: CpuSchedulerSimulation;
  m9PolicyIdx: number;
  m9PriPreempt: boolean;
}

const ZONES = {
  m1: { x: 450, y: 230, w: 300, h: 240 },
  m2: { x: 450, y: 230, w: 300, h: 240 },
  m3Bridge: { x: 400, y: 280, w: 400, h: 80 },
  m6Bridge: { x: 500, y: 280, w: 350, h: 80 },
  m7ZoneA: { x: 150, y: 250, w: 200, h: 160 },
  m7ZoneB: { x: 850, y: 250, w: 200, h: 160 },
  m8Int: { x: 250, y: 270, w: 180, h: 150 },
  m8Br: { x: 650, y: 290, w: 200, h: 60 },
  m8Pk: { x: 850, y: 80, w: 100, h: 70 },
};

const M4_PX = 200, M4_PY = 150, M4_SW = 120, M4_SH = 100;
const M5_PX = 200, M5_PY = 150, M5_SW = 120, M5_SH = 100;
const POLICY_NAMES = ['FIFO', 'SJF', 'Round Robin'];
const M6_RR_QUANTUM = 50;
const M8_PK_CAP = 3;

const INSTRUCTIONS: Record<number, InstructionData> = {
  0: {
    title: 'SIMULADOR DE CONCURRENCIA',
    subtitle: 'Sistemas Operativos',
    bg: { r: 15, g: 20, b: 40 },
    accent: { r: 80, g: 160, b: 255 },
    lines: [
      'Este simulador demuestra los mecanismos',
      'de concurrencia y sincronizacion.',
      '',
      'Los carros son hilos, las zonas son',
      'recursos compartidos.',
      '',
      'Usa los botones para interactuar.',
      '',
      'Toca [Jugar] para comenzar.',
    ],
  },
  1: {
    title: 'MODO 1: RACE CONDITION',
    subtitle: 'Sin sincronizacion',
    bg: { r: 40, g: 15, b: 15 },
    accent: { r: 255, g: 80, b: 80 },
    lines: [
      'Sin control, los carros chocan',
      'al entrar al mismo tiempo.',
      '',
      'Lanza carros y observa',
      'las colisiones.',
    ],
  },
  2: {
    title: 'MODO 2: SECCION CRITICA',
    subtitle: 'Lock() protege el cruce',
    bg: { r: 15, g: 30, b: 20 },
    accent: { r: 80, g: 220, b: 130 },
    lines: [
      'Solo un carro puede estar',
      'en el cruce a la vez.',
      '',
      'Los demas esperan (amarillo).',
    ],
  },
  3: {
    title: 'MODO 3: MUTEX',
    subtitle: 'Puente de un carril',
    bg: { r: 15, g: 20, b: 35 },
    accent: { r: 100, g: 180, b: 255 },
    lines: [
      'El puente solo permite',
      'un carro a la vez.',
      '',
      'Mutex = exclusion mutua.',
    ],
  },
  4: {
    title: 'MODO 4: SEMAFORO',
    subtitle: 'Parqueo con K cupos',
    bg: { r: 30, g: 25, b: 10 },
    accent: { r: 255, g: 200, b: 50 },
    lines: [
      'El parqueo tiene K cupos.',
      'Usa el boton para cambiar.',
      '',
      'Toca un carro verde',
      'para sacarlo.',
    ],
  },
  5: {
    title: 'MODO 5: MONITOR',
    subtitle: 'enter() / exit()',
    bg: { r: 20, g: 15, b: 35 },
    accent: { r: 180, g: 140, b: 255 },
    lines: [
      'El monitor encapsula',
      'la sincronizacion.',
      '',
      'Toca un carro verde',
      'para forzar exit().',
    ],
  },
  6: {
    title: 'MODO 6: PLANIFICACION',
    subtitle: 'FIFO / SJF / Round Robin',
    bg: { r: 10, g: 25, b: 30 },
    accent: { r: 80, g: 220, b: 200 },
    lines: [
      'Cambia la politica para ver',
      'como afecta el orden.',
      '',
      'FIFO: primero en llegar',
      'SJF: trabajo mas corto',
      'RR: quantum de tiempo',
    ],
  },
  7: {
    title: 'MODO 7: DEADLOCK',
    subtitle: 'Bloqueo circular',
    bg: { r: 30, g: 10, b: 30 },
    accent: { r: 220, g: 80, b: 255 },
    lines: [
      'Dos carros se bloquean:',
      'cada uno tiene lo que',
      'el otro necesita.',
      '',
      'Activa prevencion para evitarlo.',
    ],
  },
  8: {
    title: 'MODO 8: COMPLETO',
    subtitle: 'Todo integrado',
    bg: { r: 10, g: 25, b: 15 },
    accent: { r: 80, g: 255, b: 150 },
    lines: [
      'Interseccion + Puente + Parqueo',
      'todos sincronizados.',
      '',
      'Elige el destino con',
      'los botones.',
    ],
  },
  9: {
    title: 'MODO 9: Planificador de CPU (1 nucleo)',
    subtitle: 'Motor en TS + vista p5 — ticks discretos',
    bg: { r: 12, g: 18, b: 38 },
    accent: { r: 120, g: 200, b: 255 },
    lines: [
      'Que simula: un unico nucleo; cada tick elige quien',
      'corre 1 unidad de CPU o queda en I/O simulada.',
      '',
      'Que veras: CPU = RUNNING; azul = READY; naranja =',
      'WAITING (I/O); gris en Gantt = CPU ociosa.',
      '',
      'Politicas: FCFS (FIFO listos), SJF (menor rafaga al',
      'despachar), SRTF (expropia si hay mas corto), RR',
      '(quantum Q=5), Pri-NP / Pri-P (+ preempt con [O]).',
      '',
      'Demo: animacion mas lenta solo en este modo.',
      '[SPACE] proceso  [P] politica  [O] preempt Pri-P',
    ],
  },
};

export default function SimulatorWrapper() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const layoutP5Ref = useRef<(() => void) | null>(null);
  const p5Ref = useRef<p5 | null>(null);
  const [, forceUpdate] = useState(0);

  const stateRef = useRef<SimulatorState>({
    currentMode: 1,
    eventsLog: [],
    selectedCar: null,
    showInstructions: true,
    m1Cars: [],
    m1Collisions: 0,
    m1Flash: 0,
    m2Cars: [],
    m2Mutex: new SimMutex('Interseccion'),
    m3Cars: [],
    m3Mutex: new SimMutex('Puente'),
    m4Cars: [],
    m4Cap: 3,
    m4Sem: new SimSemaphore('Parqueo', 3),
    m5Cars: [],
    m5Cap: 3,
    m5Mon: new SimMonitor('Monitor', 3),
    m6Cars: [],
    m6Mutex: new SimMutex('Puente'),
    m6Queue: [],
    m6Policy: 0,
    m7Cars: [],
    m7RA: new SimMutex('Recurso_A'),
    m7RB: new SimMutex('Recurso_B'),
    m7Detected: false,
    m7Msg: '',
    m7Prevent: false,
    m8Cars: [],
    m8MutexInt: new SimMutex('Interseccion'),
    m8MutexBr: new SimMutex('Puente'),
    m8SemPark: new SimSemaphore('Parqueo', M8_PK_CAP),
    m8NextDest: 'auto',
    m9Cpu: new CpuSchedulerSimulation(),
    m9PolicyIdx: 0,
    m9PriPreempt: true,
  });

  const triggerUpdate = useCallback(() => {
    forceUpdate((n) => n + 1);
  }, []);

  const addEvent = useCallback((msg: string) => {
    const s = stateRef.current;
    s.eventsLog.unshift(msg);
    if (s.eventsLog.length > 10) s.eventsLog.pop();
  }, []);

  const cleanCarFromAll = useCallback((c: Car) => {
    const s = stateRef.current;
    if (s.selectedCar?.id === c.id) s.selectedCar = null;
    c.parkSlot = null;
    for (const mx of [s.m2Mutex, s.m3Mutex, s.m6Mutex, s.m7RA, s.m7RB, s.m8MutexInt, s.m8MutexBr]) {
      mx.release(c.id);
      const idx = mx.queue.indexOf(c.id);
      if (idx !== -1) mx.queue.splice(idx, 1);
    }
    for (const sm of [s.m4Sem, s.m8SemPark]) {
      sm.release(c.id);
      const idx = sm.queue.indexOf(c.id);
      if (idx !== -1) sm.queue.splice(idx, 1);
    }
    s.m5Mon.exit(c.id);
    const mIdx = s.m5Mon.queue.indexOf(c.id);
    if (mIdx !== -1) s.m5Mon.queue.splice(mIdx, 1);
    s.m6Queue = s.m6Queue.filter((x) => x.id !== c.id);
  }, []);

  // Reset functions
  const m1Reset = useCallback(() => {
    const s = stateRef.current;
    s.m1Cars = []; s.m1Collisions = 0; s.m1Flash = 0; s.selectedCar = null;
    resetCarId(); s.eventsLog = [];
    addEvent('Modo 1: Race Condition');
    triggerUpdate();
  }, [addEvent, triggerUpdate]);

  const m2Reset = useCallback(() => {
    const s = stateRef.current;
    s.m2Cars = []; s.m2Mutex.reset(); s.selectedCar = null;
    resetCarId(); s.eventsLog = [];
    addEvent('Modo 2: Seccion Critica');
    triggerUpdate();
  }, [addEvent, triggerUpdate]);

  const m3Reset = useCallback(() => {
    const s = stateRef.current;
    s.m3Cars = []; s.m3Mutex.reset(); s.selectedCar = null;
    resetCarId(); s.eventsLog = [];
    addEvent('Modo 3: Mutex');
    triggerUpdate();
  }, [addEvent, triggerUpdate]);

  const m4Reset = useCallback(() => {
    const s = stateRef.current;
    s.m4Cars = []; s.m4Cap = 3; s.m4Sem = new SimSemaphore('Parqueo', s.m4Cap);
    s.selectedCar = null; resetCarId(); s.eventsLog = [];
    addEvent('Modo 4: Semaforo');
    triggerUpdate();
  }, [addEvent, triggerUpdate]);

  const m5Reset = useCallback(() => {
    const s = stateRef.current;
    s.m5Cars = []; s.m5Cap = 3; s.m5Mon = new SimMonitor('Monitor', s.m5Cap);
    s.selectedCar = null; resetCarId(); s.eventsLog = [];
    addEvent('Modo 5: Monitor');
    triggerUpdate();
  }, [addEvent, triggerUpdate]);

  const m6Reset = useCallback(() => {
    const s = stateRef.current;
    s.m6Cars = []; s.m6Mutex.reset(); s.m6Queue = [];
    s.selectedCar = null; resetCarId(); s.eventsLog = [];
    addEvent(`Modo 6: ${POLICY_NAMES[s.m6Policy]}`);
    triggerUpdate();
  }, [addEvent, triggerUpdate]);

  const m7Reset = useCallback(() => {
    const s = stateRef.current;
    s.m7Cars = []; s.m7RA.reset(); s.m7RB.reset();
    s.m7Detected = false; s.m7Msg = ''; s.selectedCar = null;
    resetCarId(); s.eventsLog = [];
    addEvent('Modo 7: Deadlock');
    triggerUpdate();
  }, [addEvent, triggerUpdate]);

  const m8Reset = useCallback(() => {
    const s = stateRef.current;
    s.m8Cars = []; s.m8MutexInt.reset(); s.m8MutexBr.reset();
    s.m8SemPark = new SimSemaphore('Parqueo', M8_PK_CAP); s.m8NextDest = 'auto';
    s.selectedCar = null; resetCarId(); s.eventsLog = [];
    addEvent('Modo 8: Completo');
    triggerUpdate();
  }, [addEvent, triggerUpdate]);

  const m9Reset = useCallback(() => {
    const s = stateRef.current;
    s.m9Cpu.reset();
    s.m9Cpu.configure({ quantum: 5 });
    m9ApplyPolicyFromIdx(s.m9Cpu, s.m9PolicyIdx, s.m9PriPreempt);
    s.eventsLog = [];
    addEvent(`Modo 9: CPU / PCB — ${M9_POLICY_LABELS[s.m9PolicyIdx]}`);
    triggerUpdate();
  }, [addEvent, triggerUpdate]);

  // Spawn functions
  const m1Spawn = useCallback((direction?: string) => {
    const s = stateRef.current;
    const d = direction ?? (Math.random() < 0.5 ? 'H' : 'V');
    let c: Car;
    if (d === 'H') {
      c = new Car(10, Math.random() < 0.5 ? 320 : 380, 1, 0, 2 + Math.random() * 1.5);
    } else {
      c = new Car(Math.random() < 0.5 ? 560 : 630, 10, 0, 1, 2 + Math.random() * 1.5);
    }
    s.m1Cars.push(c);
    addEvent(`Car ${c.id} [${d}]`);
  }, [addEvent]);

  const m2Spawn = useCallback((d?: string) => {
    const s = stateRef.current;
    const dir = d ?? (Math.random() < 0.5 ? 'H' : 'V');
    let c: Car;
    if (dir === 'H') {
      c = new Car(10, Math.random() < 0.5 ? 320 : 380, 1, 0, 2 + Math.random());
    } else {
      c = new Car(Math.random() < 0.5 ? 560 : 630, 10, 0, 1, 2 + Math.random());
    }
    s.m2Cars.push(c);
    addEvent(`Car ${c.id}`);
  }, [addEvent]);

  const m3Spawn = useCallback(() => {
    const s = stateRef.current;
    const c = new Car(10, Math.random() < 0.5 ? 300 : 340, 1, 0, 2 + Math.random() * 1.5);
    s.m3Cars.push(c);
    addEvent(`Car ${c.id}`);
  }, [addEvent]);

  const m4Spawn = useCallback(() => {
    const s = stateRef.current;
    const c = new Car(200 + Math.random() * 600, H - 20, 0, -1, 1.5 + Math.random());
    s.m4Cars.push(c);
    addEvent(`Car ${c.id}`);
  }, [addEvent]);

  const m5Spawn = useCallback(() => {
    const s = stateRef.current;
    const c = new Car(200 + Math.random() * 600, H - 20, 0, -1, 1.5 + Math.random());
    s.m5Cars.push(c);
    addEvent(`Car ${c.id}`);
  }, [addEvent]);

  const m6Spawn = useCallback(() => {
    const s = stateRef.current;
    const c = new Car(10, Math.random() < 0.5 ? 300 : 340, 1, 0, 1.5 + Math.random() * 1.5);
    c.crossTime = 30 + Math.floor(Math.random() * 71);
    s.m6Cars.push(c);
    addEvent(`Car ${c.id} t=${c.crossTime}`);
  }, [addEvent]);

  const m7SpawnPair = useCallback(() => {
    const s = stateRef.current;
    s.m7Detected = false; s.m7Msg = '';
    s.m7RA.reset(); s.m7RB.reset();
    const a = new Car(50, 310, 1, 0, 2.0);
    a.held = []; a.state = 'RUN'; a.targetOrder = ['A', 'B'];
    s.m7Cars.push(a);
    const b = new Car(W - 50, 350, -1, 0, 2.0);
    b.held = []; b.state = 'RUN';
    b.targetOrder = s.m7Prevent ? ['A', 'B'] : ['B', 'A'];
    s.m7Cars.push(b);
    addEvent(`Par: ${a.id}, ${b.id}`);
  }, [addEvent]);

  const m8Spawn = useCallback((dest?: string) => {
    const s = stateRef.current;
    const d = dest === 'auto' || !dest ? ['int', 'br', 'pk'][Math.floor(Math.random() * 3)] : dest;
    let c: Car;
    if (d === 'int') {
      c = new Car(10, Math.random() < 0.5 ? 320 : 370, 1, 0, 2 + Math.random());
      c.dest = 'int';
    } else if (d === 'br') {
      c = new Car(550, 310, 1, 0, 2 + Math.random());
      c.dest = 'br';
    } else {
      c = new Car(900, H - 30, 0, -1, 1.5 + Math.random());
      c.dest = 'pk';
    }
    s.m8Cars.push(c);
    addEvent(`Car ${c.id} -> ${d}`);
  }, [addEvent]);

  const m4ForceExit = useCallback((c: Car) => {
    const s = stateRef.current;
    s.m4Sem.release(c.id);
    c.state = 'RUN'; c.framesIn = 0; c.parkSlot = null; c.dirY = 1; c.resume();
    addEvent(`Exit Car ${c.id}`);
  }, [addEvent]);

  const m5ForceExit = useCallback((c: Car) => {
    const s = stateRef.current;
    s.m5Mon.exit(c.id);
    c.state = 'RUN'; c.framesIn = 0; c.parkSlot = null; c.dirY = 1; c.resume();
    addEvent(`Exit Car ${c.id}`);
  }, [addEvent]);

  const m7ForceResolve = useCallback(() => {
    const s = stateRef.current;
    for (const c of s.m7Cars) {
      if (c.state === 'DEADLOCK') {
        s.m7RA.release(c.id); s.m7RB.release(c.id);
        c.held = []; c.state = 'RUN'; c.resume(); c.waitFrames = 0;
      }
    }
    s.m7RA.reset(); s.m7RB.reset();
    s.m7Detected = false; s.m7Msg = '';
    addEvent('Deadlock resuelto');
    triggerUpdate();
  }, [addEvent, triggerUpdate]);

  // Control handlers
  const handleModeChange = useCallback((mode: number) => {
    const s = stateRef.current;
    s.currentMode = mode;
    if (mode === 0) {
      s.showInstructions = true;
    } else {
      switch (mode) {
        case 1: m1Reset(); break;
        case 2: m2Reset(); break;
        case 3: m3Reset(); break;
        case 4: m4Reset(); break;
        case 5: m5Reset(); break;
        case 6: m6Reset(); break;
        case 7: m7Reset(); break;
        case 8: m8Reset(); break;
        case 9: m9Reset(); break;
      }
    }
    triggerUpdate();
  }, [m1Reset, m2Reset, m3Reset, m4Reset, m5Reset, m6Reset, m7Reset, m8Reset, m9Reset, triggerUpdate]);

  const handleToggleInstructions = useCallback(() => {
    const s = stateRef.current;
    s.showInstructions = !s.showInstructions;
    if (!s.showInstructions && s.currentMode === 0) {
      s.currentMode = 1;
      m1Reset();
    }
    triggerUpdate();
  }, [m1Reset, triggerUpdate]);

  const handleReset = useCallback(() => {
    const s = stateRef.current;
    switch (s.currentMode) {
      case 1: m1Reset(); break;
      case 2: m2Reset(); break;
      case 3: m3Reset(); break;
      case 4: m4Reset(); break;
      case 5: m5Reset(); break;
      case 6: m6Reset(); break;
      case 7: m7Reset(); break;
      case 8: m8Reset(); break;
      case 9: m9Reset(); break;
    }
  }, [m1Reset, m2Reset, m3Reset, m4Reset, m5Reset, m6Reset, m7Reset, m8Reset, m9Reset]);

  const handleSpawn = useCallback((direction?: string) => {
    const s = stateRef.current;
    switch (s.currentMode) {
      case 1: m1Spawn(direction); break;
      case 2: m2Spawn(direction); break;
      case 3: m3Spawn(); break;
      case 4: m4Spawn(); break;
      case 5: m5Spawn(); break;
      case 6: m6Spawn(); break;
      case 7: m7SpawnPair(); break;
      case 8: m8Spawn(s.m8NextDest); break;
      case 9: {
        s.m9Cpu.spawnRandomDemo();
        addEvent('M9 Nuevo proceso (CPU+I/O+CPU)');
        break;
      }
    }
  }, [m1Spawn, m2Spawn, m3Spawn, m4Spawn, m5Spawn, m6Spawn, m7SpawnPair, m8Spawn, addEvent]);

  const handleSpecialAction = useCallback((action: string) => {
    const s = stateRef.current;
    switch (action) {
      case 'k':
        if (s.currentMode === 4) {
          s.m4Cap = (s.m4Cap % 5) + 1;
          s.m4Sem = new SimSemaphore('Parqueo', s.m4Cap);
          addEvent(`Cupos: ${s.m4Cap}`);
          triggerUpdate();
        }
        break;
      case 'p':
        if (s.currentMode === 6) {
          s.m6Policy = (s.m6Policy + 1) % 3;
          addEvent(`Politica: ${POLICY_NAMES[s.m6Policy]}`);
          triggerUpdate();
        } else if (s.currentMode === 8) {
          s.m8NextDest = 'pk';
          triggerUpdate();
        } else if (s.currentMode === 9) {
          s.m9PolicyIdx = (s.m9PolicyIdx + 1) % M9_POLICIES.length;
          m9ApplyPolicyFromIdx(s.m9Cpu, s.m9PolicyIdx, s.m9PriPreempt);
          addEvent(`M9 Politica: ${M9_POLICY_LABELS[s.m9PolicyIdx]}`);
          triggerUpdate();
        }
        break;
      case 'e':
        if (s.currentMode === 7) {
          s.m7Prevent = !s.m7Prevent;
          addEvent(`Prevencion: ${s.m7Prevent ? 'ON' : 'OFF'}`);
          triggerUpdate();
        }
        break;
      case 'f':
        if (s.currentMode === 7) m7ForceResolve();
        break;
      case 'i':
        if (s.currentMode === 8) { s.m8NextDest = 'int'; triggerUpdate(); }
        break;
      case 'b':
        if (s.currentMode === 8) { s.m8NextDest = 'br'; triggerUpdate(); }
        break;
      case '0':
        if (s.currentMode === 8) { s.m8NextDest = 'auto'; triggerUpdate(); }
        break;
      case 'o':
        if (s.currentMode === 9) {
          s.m9PriPreempt = !s.m9PriPreempt;
          m9ApplyPolicyFromIdx(s.m9Cpu, s.m9PolicyIdx, s.m9PriPreempt);
          addEvent(`M9 PriPreempt: ${s.m9PriPreempt ? 'ON' : 'OFF'}`);
          triggerUpdate();
        }
        break;
    }
  }, [addEvent, m7ForceResolve, triggerUpdate]);

  useLayoutEffect(() => {
    if (!canvasContainerRef.current) return;

    let cancelled = false;
    let ro: ResizeObserver | null = null;
    let mountAttempts = 0;

    const sketch = (p: p5) => {
      const s = stateRef.current;
      let scale = 1;
      let canvasCreated = false;

      const applyLayout = () => {
        const host = canvasContainerRef.current;
        if (!host) return;
        const { width: cw, height: ch } = host.getBoundingClientRect();
        // Sin tamaño real aún: no crear un lienzo de 2×2 px; el ResizeObserver volverá a medir.
        if (cw < 8 || ch < 8) {
          if (canvasCreated) return;
          scale = 0.45;
          const bw = Math.max(2, Math.floor(W * scale));
          const bh = Math.max(2, Math.floor(H * scale));
          p.pixelDensity(1);
          p.createCanvas(bw, bh);
          canvasCreated = true;
          return;
        }
        const fit = Math.min(cw / W, ch / H);
        scale = Math.min(1, Math.max(fit, 0.02));
        const bw = Math.max(2, Math.floor(W * scale));
        const bh = Math.max(2, Math.floor(H * scale));
        p.pixelDensity(1);
        if (!canvasCreated) {
          p.createCanvas(bw, bh);
          canvasCreated = true;
        } else {
          p.resizeCanvas(bw, bh);
        }
      };

      layoutP5Ref.current = applyLayout;

      const m1Step = () => {
        if (s.m1Flash > 0) s.m1Flash--;
        if (p.frameCount % 70 === 0 && s.m1Cars.length < 10) m1Spawn();
        for (const c of [...s.m1Cars]) {
          if (c.offscreen()) { cleanCarFromAll(c); s.m1Cars = s.m1Cars.filter(x => x.id !== c.id); continue; }
          c.state = 'RUN'; c.move();
          if (c.inZone(ZONES.m1)) {
            for (const o of s.m1Cars) {
              if (o.id !== c.id && o.inZone(ZONES.m1)) {
                c.state = 'RACE_ERR'; o.state = 'RACE_ERR';
                s.m1Collisions++; s.m1Flash = 15;
              }
            }
          }
        }
      };

      const m2Step = () => {
        if (p.frameCount % 80 === 0 && s.m2Cars.length < 8) m2Spawn();
        for (const c of [...s.m2Cars]) {
          if (c.offscreen()) { cleanCarFromAll(c); s.m2Mutex.release(c.id); s.m2Cars = s.m2Cars.filter(x => x.id !== c.id); continue; }
          const appr = c.approaching(ZONES.m2), inside = c.inZone(ZONES.m2);
          if (appr && !inside) {
            if (s.m2Mutex.tryAcquire(c.id)) { c.state = 'IN_CS'; c.resume(); c.move(); }
            else { c.state = 'WAIT'; c.stop(); }
          } else if (inside) { c.state = 'IN_CS'; c.resume(); c.move(); }
          else if (c.state === 'WAIT') { if (s.m2Mutex.tryAcquire(c.id)) { c.state = 'IN_CS'; c.resume(); c.move(); } }
          else { if (s.m2Mutex.owner === c.id) s.m2Mutex.release(c.id); c.state = 'RUN'; c.resume(); c.move(); }
        }
      };

      const m3Step = () => {
        if (p.frameCount % 60 === 0 && s.m3Cars.length < 10) m3Spawn();
        for (const c of [...s.m3Cars]) {
          if (c.offscreen()) { cleanCarFromAll(c); s.m3Mutex.release(c.id); s.m3Cars = s.m3Cars.filter(x => x.id !== c.id); continue; }
          const appr = c.approaching(ZONES.m3Bridge, 40), inside = c.inZone(ZONES.m3Bridge);
          if (appr && !inside) {
            if (s.m3Mutex.tryAcquire(c.id)) { c.state = 'IN_CS'; c.resume(); c.move(); }
            else { c.state = 'WAIT_MUTEX'; c.stop(); }
          } else if (inside) { c.state = 'IN_CS'; c.resume(); c.move(); }
          else if (c.state === 'WAIT_MUTEX') { if (s.m3Mutex.tryAcquire(c.id)) { c.state = 'IN_CS'; c.resume(); c.move(); } }
          else { if (s.m3Mutex.owner === c.id) s.m3Mutex.release(c.id); c.state = 'RUN'; c.resume(); c.move(); }
        }
      };

      const m4Step = () => {
        if (p.frameCount % 70 === 0 && s.m4Cars.length < 10) m4Spawn();
        const entryY = M4_PY + M4_SH + 60;
        for (const c of [...s.m4Cars]) {
          if (c.offscreen()) { cleanCarFromAll(c); s.m4Sem.release(c.id); s.m4Cars = s.m4Cars.filter(x => x.id !== c.id); continue; }
          if (c.state === 'PARKED') { c.framesIn++; if (c.framesIn > 180) m4ForceExit(c); continue; }
          if (c.state === 'WAIT_SEM') {
            if (s.m4Sem.tryAcquire(c.id)) {
              c.state = 'PARKED'; c.stop(); c.framesIn = 0;
              const slot = firstFreeSlot(s.m4Cars, s.m4Cap); c.parkSlot = slot;
              c.x = M4_PX + slot * (M4_SW + 20) + M4_SW / 2; c.y = M4_PY + M4_SH / 2;
            }
            continue;
          }
          if (c.dirY < 0 && c.y <= entryY) {
            if (s.m4Sem.tryAcquire(c.id)) {
              c.state = 'PARKED'; c.stop(); c.framesIn = 0;
              const slot = firstFreeSlot(s.m4Cars, s.m4Cap); c.parkSlot = slot;
              c.x = M4_PX + slot * (M4_SW + 20) + M4_SW / 2; c.y = M4_PY + M4_SH / 2;
            } else { c.state = 'WAIT_SEM'; c.stop(); }
          } else { c.state = 'RUN'; c.move(); }
        }
      };

      const m5Step = () => {
        if (p.frameCount % 70 === 0 && s.m5Cars.length < 10) m5Spawn();
        const entryY = M5_PY + M5_SH + 60;
        for (const c of [...s.m5Cars]) {
          if (c.offscreen()) { cleanCarFromAll(c); s.m5Mon.exit(c.id); s.m5Cars = s.m5Cars.filter(x => x.id !== c.id); continue; }
          if (c.state === 'PARKED') { c.framesIn++; if (c.framesIn > 180) m5ForceExit(c); continue; }
          if (c.state === 'WAIT_MON') {
            if (s.m5Mon.tryEnter(c.id)) {
              c.state = 'PARKED'; c.stop(); c.framesIn = 0;
              const slot = firstFreeSlot(s.m5Cars, s.m5Cap); c.parkSlot = slot;
              c.x = M5_PX + slot * (M5_SW + 20) + M5_SW / 2; c.y = M5_PY + M5_SH / 2;
            }
            continue;
          }
          if (c.dirY < 0 && c.y <= entryY) {
            if (s.m5Mon.tryEnter(c.id)) {
              c.state = 'PARKED'; c.stop(); c.framesIn = 0;
              const slot = firstFreeSlot(s.m5Cars, s.m5Cap); c.parkSlot = slot;
              c.x = M5_PX + slot * (M5_SW + 20) + M5_SW / 2; c.y = M5_PY + M5_SH / 2;
            } else { c.state = 'WAIT_MON'; c.stop(); }
          } else { c.state = 'RUN'; c.move(); }
        }
      };

      const m6Next = (): Car | null => {
        if (s.m6Queue.length === 0) return null;
        if (s.m6Policy === 0) return s.m6Queue[0];
        if (s.m6Policy === 1) return s.m6Queue.reduce((min, c) => c.crossTime < min.crossTime ? c : min, s.m6Queue[0]);
        return s.m6Queue[0];
      };

      const m6Step = () => {
        if (p.frameCount % 55 === 0 && s.m6Cars.length < 10) m6Spawn();
        for (const c of [...s.m6Cars]) {
          if (c.offscreen()) { cleanCarFromAll(c); s.m6Mutex.release(c.id); s.m6Queue = s.m6Queue.filter(x => x.id !== c.id); s.m6Cars = s.m6Cars.filter(x => x.id !== c.id); continue; }
          const appr = c.approaching(ZONES.m6Bridge, 40), inside = c.inZone(ZONES.m6Bridge);
          if (c.state === 'WAIT_MUTEX' && !appr && !inside) {
            if (!s.m6Queue.includes(c)) s.m6Queue.push(c);
            const nxt = m6Next();
            if (nxt === c && s.m6Mutex.tryAcquire(c.id)) {
              s.m6Queue = s.m6Queue.filter(x => x.id !== c.id);
              c.state = 'IN_CS'; c.resume(); c.framesIn = 0; c.move();
            }
            continue;
          }
          if (appr && !inside && c.state !== 'IN_CS') {
            if (!s.m6Queue.includes(c)) s.m6Queue.push(c);
            const nxt = m6Next();
            if (nxt === c && s.m6Mutex.tryAcquire(c.id)) {
              s.m6Queue = s.m6Queue.filter(x => x.id !== c.id);
              c.state = 'IN_CS'; c.resume(); c.framesIn = 0; c.move();
            } else { c.state = 'WAIT_MUTEX'; c.stop(); }
          } else if (inside) {
            c.state = 'IN_CS'; c.resume(); c.framesIn++;
            if (s.m6Policy === 2 && c.framesIn >= M6_RR_QUANTUM) {
              s.m6Mutex.release(c.id); c.state = 'RUN'; c.x = ZONES.m6Bridge.x - 25; c.framesIn = 0;
              s.m6Queue.push(c); continue;
            }
            c.move();
          } else {
            if (s.m6Mutex.owner === c.id) s.m6Mutex.release(c.id);
            s.m6Queue = s.m6Queue.filter(x => x.id !== c.id);
            c.state = 'RUN'; c.resume(); c.move();
          }
        }
      };

      const m7Step = () => {
        for (const c of [...s.m7Cars]) {
          if (c.offscreen()) { cleanCarFromAll(c); s.m7RA.release(c.id); s.m7RB.release(c.id); s.m7Cars = s.m7Cars.filter(x => x.id !== c.id); continue; }
          if (c.state === 'DEADLOCK' || !c.targetOrder) continue;
          let needed: string | null = null;
          for (const r of c.targetOrder) { if (!c.held.includes(r)) { needed = r; break; } }
          if (!needed) { c.state = 'RUN'; c.resume(); c.move(); continue; }
          const mx = needed === 'A' ? s.m7RA : s.m7RB;
          if (mx.tryAcquire(c.id)) { c.held.push(needed); c.state = 'IN_CS'; c.resume(); c.move(); }
          else {
            c.state = 'WAIT_MUTEX'; c.stop(); c.waitFrames++;
            if (c.waitFrames > 30) {
              const oA = s.m7RA.owner, oB = s.m7RB.owner;
              if (oA && oB && oA !== oB) {
                const cA = getCarById(s.m7Cars, oA), cB = getCarById(s.m7Cars, oB);
                if (cA?.held && cB?.held && cA.held.includes('A') && !cA.held.includes('B') && cB.held.includes('B') && !cB.held.includes('A')) {
                  s.m7Detected = true; s.m7Msg = `${cA.id} tiene A, ${cB.id} tiene B`;
                  cA.state = 'DEADLOCK'; cB.state = 'DEADLOCK';
                }
              }
            }
          }
        }
      };

      const m8Step = () => {
        if (p.frameCount % 80 === 0 && s.m8Cars.length < 12) m8Spawn();
        for (const c of [...s.m8Cars]) {
          if (c.offscreen() && c.state !== 'PARKED') {
            cleanCarFromAll(c); s.m8MutexInt.release(c.id); s.m8MutexBr.release(c.id); s.m8SemPark.release(c.id);
            s.m8Cars = s.m8Cars.filter(x => x.id !== c.id); continue;
          }
          if (!c.dest) c.dest = 'int';
          if (c.dest === 'int') {
            const appr = c.approaching(ZONES.m8Int, 35), inside = c.inZone(ZONES.m8Int);
            if (appr && !inside) { if (s.m8MutexInt.tryAcquire(c.id)) { c.state = 'IN_CS'; c.resume(); c.move(); } else { c.state = 'WAIT_MUTEX'; c.stop(); } }
            else if (inside) { c.state = 'IN_CS'; c.resume(); c.move(); }
            else if (c.state === 'WAIT_MUTEX') { if (s.m8MutexInt.tryAcquire(c.id)) { c.state = 'IN_CS'; c.resume(); c.move(); } }
            else { if (s.m8MutexInt.owner === c.id) s.m8MutexInt.release(c.id); c.state = 'RUN'; c.resume(); c.move(); }
          } else if (c.dest === 'br') {
            const appr = c.approaching(ZONES.m8Br, 35), inside = c.inZone(ZONES.m8Br);
            if (appr && !inside) { if (s.m8MutexBr.tryAcquire(c.id)) { c.state = 'IN_CS'; c.resume(); c.move(); } else { c.state = 'WAIT_MUTEX'; c.stop(); } }
            else if (inside) { c.state = 'IN_CS'; c.resume(); c.move(); }
            else if (c.state === 'WAIT_MUTEX') { if (s.m8MutexBr.tryAcquire(c.id)) { c.state = 'IN_CS'; c.resume(); c.move(); } }
            else { if (s.m8MutexBr.owner === c.id) s.m8MutexBr.release(c.id); c.state = 'RUN'; c.resume(); c.move(); }
          } else if (c.dest === 'pk') {
            if (c.state === 'PARKED') { c.framesIn++; if (c.framesIn > 150) { s.m8SemPark.release(c.id); c.state = 'RUN'; c.framesIn = 0; c.parkSlot = null; c.dirY = 1; c.resume(); } continue; }
            if (c.state === 'WAIT_SEM') {
              if (s.m8SemPark.tryAcquire(c.id)) {
                c.state = 'PARKED'; c.stop(); c.framesIn = 0;
                const slot = firstFreeSlot(s.m8Cars, M8_PK_CAP); c.parkSlot = slot;
                c.x = ZONES.m8Pk.x + 20 + slot * 35; c.y = ZONES.m8Pk.y + ZONES.m8Pk.h / 2;
              }
              continue;
            }
            if (c.dirY < 0 && c.y <= ZONES.m8Pk.y + ZONES.m8Pk.h + 40) {
              if (s.m8SemPark.tryAcquire(c.id)) {
                c.state = 'PARKED'; c.stop(); c.framesIn = 0;
                const slot = firstFreeSlot(s.m8Cars, M8_PK_CAP); c.parkSlot = slot;
                c.x = ZONES.m8Pk.x + 20 + slot * 35; c.y = ZONES.m8Pk.y + ZONES.m8Pk.h / 2;
              } else { c.state = 'WAIT_SEM'; c.stop(); }
            } else { c.state = 'RUN'; c.move(); }
          }
        }
      };

      const m9Step = () => {
        /** Solo modo 9: 1 tick simulado cada N frames de p5 (demo mas lenta; otros modos no usan esto). */
        const M9_FRAMES_PER_SIM_TICK = 10;
        if (p.frameCount % M9_FRAMES_PER_SIM_TICK !== 0) return;
        const cpu = s.m9Cpu;
        const evs = cpu.step();
        for (const e of evs) {
          if (e.type === 'PREEMPT') {
            addEvent(`M9 PREEMPT P${e.pid} ${e.reason}`);
          } else if (e.type === 'TERMINATE') {
            addEvent(`M9 TERM P${e.pid}`);
          }
        }
      };

      /** Texto multilinea acotado a un rectangulo (modo 9). */
      const m9TextBox = (
        txt: string,
        x: number,
        y: number,
        w: number,
        h: number,
        sz: number,
        rgb: [number, number, number],
      ): void => {
        p.push();
        p.fill(rgb[0], rgb[1], rgb[2]);
        p.noStroke();
        p.textSize(sz);
        p.textLeading(sz * 1.15);
        p.textAlign(p.LEFT, p.TOP);
        p.text(txt, x, y, w, h);
        p.pop();
      };

      const m9Draw = () => {
        drawSceneBg(p);
        const snap = s.m9Cpu.getSnapshot();
        const polLabel = M9_POLICY_LABELS[s.m9PolicyIdx % M9_POLICY_LABELS.length];
        const pr =
          snap.policy === 'PRIORITY_P' ? `  PreemptPri=${snap.priorityPreemptive ? 'ON' : 'off'}` : '';

        drawPanel(p, 10, 8, 1180, 102);
        m9TextBox(
          'MODO 9: PCB y planificador (1 nucleo, tiempo discreto)',
          22,
          14,
          1140,
          22,
          13,
          [255, 200, 50],
        );
        m9TextBox(
          `Politica: ${polLabel}  Quantum RR=${snap.quantum}${pr}`,
          22,
          36,
          1140,
          22,
          10,
          [190, 200, 220],
        );
        const m = snap.metrics;
        const mtxt =
          m.avgTurnaround != null
            ? `Terminados=${m.terminatedCount}  T_retorno_medio=${m.avgTurnaround.toFixed(1)}  W_listo_medio=${(m.avgWait ?? 0).toFixed(1)}  U_CPU~${(m.cpuUtilization * 100).toFixed(0)}%  tick=${snap.nowTick}`
            : `Terminados=0  U_CPU~${(snap.metrics.cpuUtilization * 100).toFixed(0)}%  tick=${snap.nowTick}`;
        m9TextBox(mtxt, 22, 58, 1140, 44, 9, [150, 180, 200]);

        const cpuX = 430;
        const cpuW = 340;
        drawPanel(p, cpuX, 118, cpuW, 168);
        m9TextBox('CPU (RUNNING)', cpuX + 12, 124, cpuW - 24, 16, 11, [100, 200, 255]);
        if (snap.running) {
          const r = snap.running;
          p.fill(50, 200, 110, 90);
          p.noStroke();
          p.rect(cpuX + 10, 146, cpuW - 20, 128, 8);
          m9TextBox(
            `${r.name}  pid=${r.pid}\nestado=${r.state}\nremCPU=${r.cpuBurstRemaining}  prioridad=${r.priority}`,
            cpuX + 18,
            154,
            cpuW - 36,
            112,
            10,
            [255, 255, 255],
          );
        } else {
          p.fill(160, 160, 170);
          p.noStroke();
          p.textSize(13);
          p.textAlign(p.CENTER, p.CENTER);
          p.text('(CPU ociosa)', cpuX + cpuW / 2, 118 + 84);
        }

        const readyX = 20;
        const readyW = 390;
        drawPanel(p, readyX, 118, readyW, 168);
        m9TextBox('COLA READY (listos, sin ejecutar)', readyX + 10, 124, readyW - 20, 28, 10, [100, 200, 255]);
        let x = readyX + 12;
        const yChip = 158;
        const chipW = 72;
        const chipH = 52;
        for (let i = 0; i < snap.ready.length; i++) {
          const q = snap.ready[i]!;
          if (x + chipW > readyX + readyW - 8) break;
          p.fill(70, 130, 200, 200);
          p.stroke(120, 180, 255);
          p.rect(x, yChip, chipW, chipH, 7);
          m9TextBox(`P${q.pid}\nr=${q.cpuBurstRemaining}`, x + 4, yChip + 8, chipW - 8, chipH - 14, 9, [255, 255, 255]);
          x += chipW + 8;
        }
        if (snap.ready.length === 0) {
          m9TextBox('(vacia)', readyX + 12, yChip + 12, readyW - 24, 40, 10, [140, 140, 150]);
        }

        const waitX = 790;
        const waitW = 380;
        drawPanel(p, waitX, 118, waitW, 168);
        m9TextBox('I/O (WAITING)', waitX + 10, 124, waitW - 20, 22, 11, [255, 200, 80]);
        let wx = waitX + 12;
        const yW = 158;
        const wChipW = 78;
        const wChipH = 52;
        for (let i = 0; i < snap.waiting.length; i++) {
          const wv = snap.waiting[i]!;
          if (wx + wChipW > waitX + waitW - 8) break;
          p.fill(180, 100, 60, 210);
          p.stroke(255, 160, 80);
          p.rect(wx, yW, wChipW, wChipH, 7);
          m9TextBox(`P${wv.pid}\nio=${wv.remainingInPhase}`, wx + 4, yW + 8, wChipW - 8, wChipH - 14, 9, [255, 255, 255]);
          wx += wChipW + 8;
        }
        if (snap.waiting.length === 0) {
          m9TextBox('(vacia)', waitX + 12, yW + 12, waitW - 24, 40, 10, [140, 140, 150]);
        }

        drawPanel(p, 20, 298, 560, 88);
        m9TextBox(
          'NEW: llegada futura (no usado en spawn rapido; queda vacio salvo arrival>t)',
          28,
          304,
          540,
          36,
          9,
          [200, 200, 120],
        );
        const pendTxt =
          snap.pendingNew.length > 0
            ? snap.pendingNew.map((n) => `${n.name}@t${n.arrivalTime ?? '?'}`).join(', ')
            : '(ninguno)';
        m9TextBox(pendTxt, 28, 338, 540, 42, 9, [180, 180, 200]);

        drawPanel(p, 600, 298, 590, 88);
        m9TextBox('TERMINATED (ultimos PIDs)', 612, 304, 560, 20, 10, [160, 220, 160]);
        const terms = snap.terminated.slice(-16);
        const termStr = terms.length ? terms.map((t) => `P${t.pid}`).join(' ') : '(ninguno)';
        m9TextBox(termStr, 612, 326, 560, 52, 10, [200, 220, 200]);

        drawPanel(p, 20, 396, 1160, 108);
        m9TextBox(
          'MINI-GANTT: cada columna=1 tick simul. Gris=CPU sin trabajo; color=PID distinto.',
          28,
          402,
          1120,
          36,
          10,
          [100, 200, 255],
        );
        const g = snap.ganttRecent;
        const gx0 = 28;
        const gy = 438;
        const gw = Math.min(g.length, 72);
        const start = Math.max(0, g.length - 72);
        for (let i = 0; i < gw; i++) {
          const seg = g[start + i]!;
          const pid = seg.pid;
          const col =
            pid < 0
              ? [90, 90, 95]
              : [(pid * 47) % 200 + 40, (pid * 89) % 180 + 60, (pid * 17) % 200 + 80];
          p.fill(col[0], col[1], col[2], 220);
          p.noStroke();
          p.rect(gx0 + i * 15, gy, 13, 56, 3);
        }

        drawPanel(p, 20, H - 72, 1160, 62);
        m9TextBox(
          '[SPACE] nuevo proceso demo  |  [P] siguiente politica  |  [O] preempt en Pri-P',
          28,
          H - 66,
          1120,
          22,
          9,
          [170, 185, 205],
        );
        m9TextBox(
          'Velocidad: 1 tick simulado cada 10 frames (solo este modo). No es el planificador real del PC.',
          28,
          H - 44,
          1120,
          28,
          8,
          [140, 150, 170],
        );
      };

      // Simplified draw functions
      const m1Draw = () => {
        drawSceneBg(p); drawHRoad(p, 0, 270, W, 200); drawVRoad(p, 500, 0, 200, H); drawCrosswalks(p, ZONES.m1);
        const blink = Math.floor(p.frameCount / 20) % 2 === 0 ? 'yellow' : 'off';
        drawTrafficLight(p, ZONES.m1.x - 42, ZONES.m1.y + 40, blink, true, 0.9);
        if (s.m1Flash > 0) { p.fill(255, 60, 60, 90); p.stroke(255, 90, 90); p.strokeWeight(3); }
        else { p.fill(90, 95, 110, 110); p.stroke(255, 110); p.strokeWeight(2); }
        p.rect(ZONES.m1.x, ZONES.m1.y, ZONES.m1.w, ZONES.m1.h, 8);
        p.fill(255, 180); p.textAlign(p.CENTER, p.CENTER); p.textSize(14);
        p.text('SIN CONTROL', ZONES.m1.x + ZONES.m1.w / 2, ZONES.m1.y + ZONES.m1.h / 2);
        for (const c of s.m1Cars) c.draw(p, s.selectedCar === c);
        drawPanel(p, 10, 10, 300, 50);
        drawLabel(p, `Colisiones: ${s.m1Collisions}`, 20, 20, 14, { r: 255, g: 80, b: 80 });
      };

      const m2Draw = () => {
        drawSceneBg(p); drawHRoad(p, 0, 270, W, 200); drawVRoad(p, 500, 0, 200, H); drawCrosswalks(p, ZONES.m2);
        const [hLight, vLight] = mutexLightStates(s.m2Cars, s.m2Mutex, p.frameCount);
        drawTrafficLight(p, ZONES.m2.x - 42, ZONES.m2.y + 40, hLight, true, 0.9);
        drawTrafficLight(p, ZONES.m2.x + 40, ZONES.m2.y - 42, vLight, false, 0.9);
        p.fill(s.m2Mutex.owner ? 50 : 90, s.m2Mutex.owner ? 180 : 95, s.m2Mutex.owner ? 80 : 110, s.m2Mutex.owner ? 78 : 110);
        p.stroke(50, 220, 110, 180); p.strokeWeight(2);
        p.rect(ZONES.m2.x, ZONES.m2.y, ZONES.m2.w, ZONES.m2.h, 8);
        p.fill(255, 180); p.textAlign(p.CENTER, p.CENTER); p.textSize(14);
        p.text('PROTEGIDO', ZONES.m2.x + ZONES.m2.w / 2, ZONES.m2.y + ZONES.m2.h / 2);
        for (const c of s.m2Cars) c.draw(p, s.selectedCar === c);
        drawPanel(p, 10, 10, 280, 50);
        drawLabel(p, `Owner: ${s.m2Mutex.owner ?? 'None'}`, 20, 20, 12, { r: 100, g: 200, b: 255 });
      };

      const m3Draw = () => {
        drawSceneBg(p); drawWater(p, 360, 180, 480, 280);
        drawHRoad(p, 0, 270, 380, 100); drawHRoad(p, 820, 270, W - 820, 100);
        p.fill(118, 90, 62); p.stroke(185, 155, 110); p.strokeWeight(3);
        p.rect(ZONES.m3Bridge.x, ZONES.m3Bridge.y, ZONES.m3Bridge.w, ZONES.m3Bridge.h, 8);
        drawTrafficLight(p, ZONES.m3Bridge.x - 36, ZONES.m3Bridge.y + 40, !s.m3Mutex.owner ? 'green' : 'red', true, 0.85);
        p.fill(255, 205); p.textAlign(p.CENTER, p.CENTER); p.textSize(16);
        p.text('PUENTE', ZONES.m3Bridge.x + ZONES.m3Bridge.w / 2, ZONES.m3Bridge.y + ZONES.m3Bridge.h / 2);
        for (const c of s.m3Cars) c.draw(p, s.selectedCar === c);
        drawPanel(p, 10, 10, 260, 50);
        drawLabel(p, `Owner: ${s.m3Mutex.owner ?? 'None'}`, 20, 20, 12, { r: 100, g: 200, b: 255 });
      };

      const m4Draw = () => {
        drawSceneBg(p); drawVRoad(p, W / 2 - 60, M4_PY + M4_SH + 40, 120, H - M4_PY - M4_SH - 40);
        const lotW = s.m4Cap * (M4_SW + 20) + 40;
        p.fill(52, 54, 58); p.noStroke(); p.rect(M4_PX - 30, M4_PY - 40, lotW, M4_SH + 85, 12);
        drawParkingSign(p, M4_PX - 60, M4_PY + 20);
        drawDigitalBoard(p, M4_PX + lotW - 150, M4_PY - 52, 120, 48, 'DISP.', `${s.m4Sem.available()}/${s.m4Cap}`, s.m4Sem.available() > 0);
        drawBarrier(p, W / 2, M4_PY + M4_SH + 28, s.m4Sem.available() > 0, false);
        const occ = getParkedSlots(s.m4Cars);
        for (let i = 0; i < s.m4Cap; i++) {
          const sx = M4_PX + i * (M4_SW + 20);
          p.noFill(); p.stroke(250, 250, 250, 150); p.strokeWeight(3);
          p.rect(sx, M4_PY, M4_SW, M4_SH, 8);
          if (occ.has(i)) { p.fill(50, 170, 90, 35); p.noStroke(); p.rect(sx + 6, M4_PY + 6, M4_SW - 12, M4_SH - 12, 8); }
        }
        for (const c of s.m4Cars) c.draw(p, s.selectedCar === c);
      };

      const m5Draw = () => {
        drawSceneBg(p); drawVRoad(p, W / 2 - 60, M5_PY + M5_SH + 40, 120, H - M5_PY - M5_SH - 40);
        const lotW = s.m5Cap * (M5_SW + 20) + 40;
        p.fill(58, 60, 76); p.noStroke(); p.rect(M5_PX - 30, M5_PY - 52, lotW, M5_SH + 95, 12);
        drawParkingSign(p, M5_PX - 60, M5_PY + 18, 'M');
        drawDigitalBoard(p, M5_PX + lotW - 160, M5_PY - 66, 130, 52, 'QUEUE', String(s.m5Mon.queue.length), s.m5Mon.queue.length === 0);
        drawBarrier(p, W / 2, M5_PY + M5_SH + 28, s.m5Mon.inside.length < s.m5Cap, false);
        const occ = getParkedSlots(s.m5Cars);
        for (let i = 0; i < s.m5Cap; i++) {
          const sx = M5_PX + i * (M5_SW + 20);
          p.noFill(); p.stroke(170, 180, 255, 170); p.strokeWeight(3);
          p.rect(sx, M5_PY, M5_SW, M5_SH, 8);
          if (occ.has(i)) { p.fill(70, 140, 220, 38); p.noStroke(); p.rect(sx + 6, M5_PY + 6, M5_SW - 12, M5_SH - 12, 8); }
        }
        p.fill(255, 180); p.textAlign(p.LEFT, p.CENTER); p.textSize(14);
        p.text('MONITOR', M5_PX - 10, M5_PY - 34);
        for (const c of s.m5Cars) c.draw(p, s.selectedCar === c);
      };

      const m6Draw = () => {
        drawSceneBg(p); drawWater(p, 480, 190, 390, 260);
        drawHRoad(p, 0, 270, 480, 100); drawHRoad(p, 870, 270, W - 870, 100);
        p.fill(118, 90, 62); p.stroke(185, 155, 110); p.strokeWeight(3);
        p.rect(ZONES.m6Bridge.x, ZONES.m6Bridge.y, ZONES.m6Bridge.w, ZONES.m6Bridge.h, 8);
        drawDigitalBoard(p, 268, 200, 220, 52, 'POL.', POLICY_NAMES[s.m6Policy], true);
        drawBarrier(p, 474, 320, s.m6Mutex.owner === null, false);
        p.fill(255, 205); p.textAlign(p.CENTER, p.CENTER); p.textSize(14);
        p.text(POLICY_NAMES[s.m6Policy], ZONES.m6Bridge.x + ZONES.m6Bridge.w / 2, ZONES.m6Bridge.y + ZONES.m6Bridge.h / 2);
        for (const c of s.m6Cars) c.draw(p, s.selectedCar === c);
      };

      const m7Draw = () => {
        drawSceneBg(p); drawHRoad(p, 0, 260, W, 160);
        drawResourceGate(p, ZONES.m7ZoneA, 'A', { r: 90, g: 210, b: 120 }, s.m7RA.owner);
        drawResourceGate(p, ZONES.m7ZoneB, 'B', { r: 110, g: 140, b: 255 }, s.m7RB.owner);
        if (s.m7Detected) {
          p.stroke(255, 70, 70, 210); p.strokeWeight(4);
          p.line(ZONES.m7ZoneA.x + ZONES.m7ZoneA.w, 300, ZONES.m7ZoneB.x, 300);
          p.fill(255, 65, 65); p.textAlign(p.CENTER, p.CENTER); p.textSize(22);
          p.text('DEADLOCK!', W / 2, 225);
        }
        for (const c of s.m7Cars) c.draw(p, s.selectedCar === c);
        drawPanel(p, 10, 10, 200, 50);
        drawLabel(p, s.m7Detected ? 'DEADLOCK!' : s.m7Prevent ? 'Prevencion ON' : 'Prevencion OFF', 20, 20, 12, s.m7Detected ? { r: 255, g: 80, b: 80 } : { r: 100, g: 200, b: 255 });
      };

      const m8Draw = () => {
        drawSceneBg(p); drawWater(p, 630, 248, 240, 146);
        drawHRoad(p, 0, 280, 650, 100); drawHRoad(p, 650, 280, 300, 80);
        drawVRoad(p, 280, 0, 120, 280); drawVRoad(p, 280, 380, 120, H - 380);
        drawVRoad(p, 880, ZONES.m8Pk.y + ZONES.m8Pk.h, 40, H - ZONES.m8Pk.y - ZONES.m8Pk.h);
        drawCrosswalks(p, ZONES.m8Int);
        const [hLight, vLight] = mutexLightStates(s.m8Cars, s.m8MutexInt, p.frameCount);
        drawTrafficLight(p, ZONES.m8Int.x - 34, ZONES.m8Int.y + 34, hLight, true, 0.8);
        drawTrafficLight(p, ZONES.m8Int.x + 34, ZONES.m8Int.y - 34, vLight, false, 0.8);
        p.fill(s.m8MutexInt.owner ? 50 : 80, s.m8MutexInt.owner ? 180 : 85, s.m8MutexInt.owner ? 80 : 95, s.m8MutexInt.owner ? 70 : 110);
        p.stroke(100, 200, 100, 120); p.strokeWeight(2);
        p.rect(ZONES.m8Int.x, ZONES.m8Int.y, ZONES.m8Int.w, ZONES.m8Int.h, 8);
        p.fill(118, 90, 62); p.stroke(185, 155, 110); p.strokeWeight(3);
        p.rect(ZONES.m8Br.x, ZONES.m8Br.y, ZONES.m8Br.w, ZONES.m8Br.h, 8);
        drawTrafficLight(p, ZONES.m8Br.x - 28, ZONES.m8Br.y + 30, !s.m8MutexBr.owner ? 'green' : 'red', true, 0.75);
        p.fill(52, 54, 58); p.noStroke(); p.rect(ZONES.m8Pk.x - 18, ZONES.m8Pk.y - 22, 136, 100, 12);
        drawParkingSign(p, ZONES.m8Pk.x - 38, ZONES.m8Pk.y + 10);
        drawDigitalBoard(p, ZONES.m8Pk.x + 126, ZONES.m8Pk.y - 12, 82, 40, 'P', `${s.m8SemPark.available()}/${M8_PK_CAP}`, s.m8SemPark.available() > 0);
        drawBarrier(p, 900, ZONES.m8Pk.y + ZONES.m8Pk.h + 10, s.m8SemPark.available() > 0, false);
        for (const c of s.m8Cars) c.draw(p, s.selectedCar === c);
      };

      const drawGlobalHUD = () => {
        drawPanel(p, W - 280, H - 140, 270, 130);
        drawLabel(p, 'EVENTOS:', W - 270, H - 132, 10, { r: 100, g: 200, b: 255 });
        for (let i = 0; i < Math.min(7, s.eventsLog.length); i++) {
          drawLabel(p, s.eventsLog[i], W - 270, H - 118 + i * 14, 9, { r: 200, g: 200, b: 200 });
        }
        drawPanel(p, W - 280, H - 175, 270, 30);
        const lx = W - 268;
        drawStatusChip(p, lx, H - 160, COLORS.C_RUN, 'RUN');
        drawStatusChip(p, lx + 50, H - 160, COLORS.C_WAIT, 'WAIT');
        drawStatusChip(p, lx + 105, H - 160, COLORS.C_IN_CS, 'IN');
        drawStatusChip(p, lx + 155, H - 160, COLORS.C_ERROR, 'ERR');
        drawStatusChip(p, lx + 205, H - 160, COLORS.C_DEAD, 'DEAD');
      };

      const drawInstructions = () => {
        const data = INSTRUCTIONS[s.currentMode] || INSTRUCTIONS[0];
        const { bg, accent, lines, title, subtitle } = data;
        p.background(bg.r, bg.g, bg.b);
        p.noFill(); p.stroke(accent.r, accent.g, accent.b, 40); p.strokeWeight(1);
        for (let i = 0; i < 10; i++) p.ellipse(W / 2, H / 2, 100 + i * 80, 100 + i * 80);
        const px = 60, py = 40, pw = W - 120, ph = H - 80;
        p.fill(0, 0, 0, 150); p.noStroke(); p.rect(px, py, pw, ph, 16);
        p.fill(accent.r, accent.g, accent.b); p.textAlign(p.LEFT, p.TOP); p.textSize(18);
        p.text(title, px + 20, py + 15);
        p.fill(200, 200, 220); p.textSize(11); p.text(subtitle, px + 20, py + 38);
        p.stroke(accent.r, accent.g, accent.b, 60); p.strokeWeight(1);
        p.line(px + 20, py + 55, px + pw - 20, py + 55);
        let ty = py + 70;
        for (const ln of lines) {
          if (ln === '') { ty += 6; continue; }
          p.fill(200, 200, 210); p.textSize(12); p.textAlign(p.LEFT, p.TOP);
          p.text(ln, px + 25, ty); ty += 18;
        }
      };

      const getCurrentCars = (): Car[] => {
        switch (s.currentMode) {
          case 1: return s.m1Cars; case 2: return s.m2Cars; case 3: return s.m3Cars;
          case 4: return s.m4Cars; case 5: return s.m5Cars; case 6: return s.m6Cars;
          case 7: return s.m7Cars; case 8: return s.m8Cars; case 9: return [];
          default: return [];
        }
      };

      p.setup = () => {
        applyLayout();
        p.textFont('monospace');
        m1Reset();
      };

      p.draw = () => {
        p.resetMatrix();
        p.scale(scale);
        if (s.showInstructions) drawInstructions();
        else {
          switch (s.currentMode) {
            case 1: m1Step(); m1Draw(); break; case 2: m2Step(); m2Draw(); break;
            case 3: m3Step(); m3Draw(); break; case 4: m4Step(); m4Draw(); break;
            case 5: m5Step(); m5Draw(); break; case 6: m6Step(); m6Draw(); break;
            case 7: m7Step(); m7Draw(); break; case 8: m8Step(); m8Draw(); break;
            case 9: m9Step(); m9Draw(); break;
          }
          drawGlobalHUD();
        }
      };

      p.mousePressed = () => {
        if (s.showInstructions) return;
        const mx = p.mouseX / scale;
        const my = p.mouseY / scale;
        const cars = getCurrentCars();
        for (const c of cars) {
          if (c.clicked(mx, my)) {
            s.selectedCar = c;
            if (s.currentMode === 4 && c.state === 'PARKED') m4ForceExit(c);
            if (s.currentMode === 5 && c.state === 'PARKED') m5ForceExit(c);
            break;
          }
        }
      };

      p.keyPressed = () => {
        if (s.showInstructions) return;
        if (s.currentMode !== 9) return;
        const k = p.key.toLowerCase();
        if (k === ' ') {
          s.m9Cpu.spawnRandomDemo();
          addEvent('M9 Nuevo proceso');
        } else if (k === 'p') {
          s.m9PolicyIdx = (s.m9PolicyIdx + 1) % M9_POLICIES.length;
          m9ApplyPolicyFromIdx(s.m9Cpu, s.m9PolicyIdx, s.m9PriPreempt);
          addEvent(`M9 Politica: ${M9_POLICY_LABELS[s.m9PolicyIdx]}`);
        } else if (k === 'o') {
          s.m9PriPreempt = !s.m9PriPreempt;
          m9ApplyPolicyFromIdx(s.m9Cpu, s.m9PolicyIdx, s.m9PriPreempt);
          addEvent(`M9 PriPreempt: ${s.m9PriPreempt ? 'ON' : 'OFF'}`);
        }
        triggerUpdate();
      };

      p.windowResized = () => {
        applyLayout();
      };
    };

    const tryMountP5 = () => {
      const host = canvasContainerRef.current;
      if (cancelled || !host) return;
      const { width: cw, height: ch } = host.getBoundingClientRect();
      if ((cw < 32 || ch < 32) && mountAttempts++ < 160) {
        requestAnimationFrame(tryMountP5);
        return;
      }
      if (p5Ref.current) return;
      p5Ref.current = new p5(sketch, host);
      ro = new ResizeObserver(() => layoutP5Ref.current?.());
      ro.observe(host);
      requestAnimationFrame(() => layoutP5Ref.current?.());
    };

    tryMountP5();

    return () => {
      cancelled = true;
      ro?.disconnect();
      layoutP5Ref.current = null;
      p5Ref.current?.remove();
      p5Ref.current = null;
    };
  }, [addEvent, cleanCarFromAll, m1Reset, m1Spawn, m2Reset, m2Spawn, m3Reset, m3Spawn, m4ForceExit, m4Reset, m4Spawn, m5ForceExit, m5Reset, m5Spawn, m6Reset, m6Spawn, m7ForceResolve, m7Reset, m7SpawnPair, m8Reset, m8Spawn, m9Reset, triggerUpdate]);

  const s = stateRef.current;

  return (
    <div className="simulator-wrapper" ref={containerRef}>
      <div className="canvas-container" ref={canvasContainerRef} />
      <div className="simulator-controls-slot">
        <Controls
          currentMode={s.currentMode}
          showInstructions={s.showInstructions}
          onModeChange={handleModeChange}
          onToggleInstructions={handleToggleInstructions}
          onReset={handleReset}
          onSpawn={handleSpawn}
          onSpecialAction={handleSpecialAction}
          m4Cap={s.m4Cap}
          m6Policy={s.m6Policy}
          m7Prevent={s.m7Prevent}
          m8NextDest={s.m8NextDest}
          m9PolicyIdx={s.m9PolicyIdx}
          m9PriPreempt={s.m9PriPreempt}
        />
      </div>
    </div>
  );
}
