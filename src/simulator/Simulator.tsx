import { useEffect, useRef, useCallback } from 'react';
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
  pointInRect,
} from './drawing';

interface SimulatorState {
  currentMode: number;
  eventsLog: string[];
  selectedCar: Car | null;
  showInstructions: boolean;
  // Mode 1
  m1Cars: Car[];
  m1Collisions: number;
  m1Flash: number;
  // Mode 2
  m2Cars: Car[];
  m2Mutex: SimMutex;
  // Mode 3
  m3Cars: Car[];
  m3Mutex: SimMutex;
  // Mode 4
  m4Cars: Car[];
  m4Cap: number;
  m4Sem: SimSemaphore;
  // Mode 5
  m5Cars: Car[];
  m5Cap: number;
  m5Mon: SimMonitor;
  // Mode 6
  m6Cars: Car[];
  m6Mutex: SimMutex;
  m6Queue: Car[];
  m6Policy: number;
  // Mode 7
  m7Cars: Car[];
  m7RA: SimMutex;
  m7RB: SimMutex;
  m7Detected: boolean;
  m7Msg: string;
  m7Prevent: boolean;
  // Mode 8
  m8Cars: Car[];
  m8MutexInt: SimMutex;
  m8MutexBr: SimMutex;
  m8SemPark: SimSemaphore;
  m8NextDest: string;
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
    title: 'SIMULADOR DE CONCURRENCIA Y SINCRONIZACION',
    subtitle: 'Sistemas Operativos - Universidad Rafael Landivar',
    bg: { r: 15, g: 20, b: 40 },
    accent: { r: 80, g: 160, b: 255 },
    lines: [
      'Este simulador demuestra visualmente como funcionan los',
      'mecanismos de concurrencia y sincronizacion en un SO.',
      '',
      'Cada modo representa un concepto diferente usando la',
      'analogia de trafico vehicular: los carros son hilos,',
      'las zonas son recursos compartidos, y los semaforos/mutex',
      'controlan el acceso a esos recursos.',
      '',
      'CONTROLES GENERALES:',
      '  [1-8]  Cambiar entre modos de simulacion',
      '  [TAB]  Abrir/cerrar estas instrucciones',
      '  [R]    Reiniciar el modo actual',
      '  [SPACE] Lanzar un carro (en todos los modos)',
      '  [Click] Seleccionar un carro para ver su info',
      '',
      'Presiona [1-8] para ver las instrucciones de cada modo,',
      'o presiona [TAB] para comenzar.',
    ],
  },
  1: {
    title: 'MODO 1: SIN CONTROL - Condiciones de Carrera',
    subtitle: 'Concepto: Concurrencia sin sincronizacion',
    bg: { r: 40, g: 15, b: 15 },
    accent: { r: 255, g: 80, b: 80 },
    lines: [
      'QUE ES UNA CONDICION DE CARRERA?',
      'Ocurre cuando dos o mas hilos acceden a un recurso',
      'compartido al mismo tiempo sin control. El resultado',
      'es impredecible (en nuestro caso: colisiones).',
      '',
      'EN ESTE MODO:',
      'La interseccion NO tiene ningun lock ni semaforo.',
      'Los carros entran libremente y cuando dos estan dentro',
      'al mismo tiempo, ocurre una COLISION (se pintan rojo).',
      '',
      'CONTROLES:',
      '  [SPACE]  Lanzar un carro aleatorio',
      '  [H]      Lanzar carro horizontal',
      '  [V]      Lanzar carro vertical',
      '  [Click]  Seleccionar carro',
    ],
  },
  2: {
    title: 'MODO 2: SECCION CRITICA',
    subtitle: 'Concepto: Zona protegida con Lock()',
    bg: { r: 15, g: 30, b: 20 },
    accent: { r: 80, g: 220, b: 130 },
    lines: [
      'QUE ES UNA SECCION CRITICA?',
      'Es una zona donde solo UN hilo puede estar a la vez.',
      'Si otro hilo quiere entrar, debe ESPERAR.',
      '',
      'EN ESTE MODO:',
      'La interseccion esta protegida con Lock().',
      'Solo un carro puede estar dentro a la vez.',
      'Los demas esperan (color amarillo) hasta que salga.',
      '',
      'CONTROLES:',
      '  [SPACE]  Lanzar carro',
      '  [H]      Lanzar horizontal    [V]  Lanzar vertical',
    ],
  },
  3: {
    title: 'MODO 3: MUTEX (Lock Binario)',
    subtitle: 'Concepto: Lock() con acquire()/release()',
    bg: { r: 15, g: 20, b: 35 },
    accent: { r: 100, g: 180, b: 255 },
    lines: [
      'QUE ES UN MUTEX?',
      'Mutex = Mutual Exclusion. Es un lock binario que',
      'garantiza que solo UN hilo accede al recurso.',
      '',
      'EN ESTE MODO:',
      'El puente es un recurso de un solo carril protegido',
      'por un Mutex. Solo un carro cruza a la vez.',
      '',
      'CONTROLES:',
      '  [SPACE]  Lanzar carro al puente',
    ],
  },
  4: {
    title: 'MODO 4: SEMAFORO (Contador)',
    subtitle: 'Concepto: Semaphore(K) - K permisos',
    bg: { r: 30, g: 25, b: 10 },
    accent: { r: 255, g: 200, b: 50 },
    lines: [
      'QUE ES UN SEMAFORO?',
      'A diferencia del Mutex (1 permiso), el Semaforo tiene',
      'un CONTADOR que permite hasta K hilos simultaneos.',
      '',
      'EN ESTE MODO:',
      'El parqueo tiene K cupos. Cada carro que entra',
      'decrementa el contador. Al salir lo incrementa.',
      '',
      'CONTROLES:',
      '  [SPACE]  Lanzar carro al parqueo',
      '  [K]      Cambiar numero de cupos (1-5)',
      '  [Click carro verde]  Forzar salida',
    ],
  },
  5: {
    title: 'MODO 5: MONITOR',
    subtitle: 'Concepto: Condition() - Metodos protegidos',
    bg: { r: 20, g: 15, b: 35 },
    accent: { r: 180, g: 140, b: 255 },
    lines: [
      'QUE ES UN MONITOR?',
      'Un Monitor encapsula un recurso con metodos protegidos.',
      'Internamente usa lock + variable de condicion.',
      '',
      'EN ESTE MODO:',
      'La estacion tiene metodos enter() y exit().',
      'Si no hay cupo, el carro entra a la cola de espera.',
      '',
      'CONTROLES:',
      '  [SPACE]  Lanzar carro',
      '  [Click carro verde]  Forzar exit()',
    ],
  },
  6: {
    title: 'MODO 6: PLANIFICACION (FIFO / SJF / RR)',
    subtitle: 'Concepto: Politicas de acceso al recurso',
    bg: { r: 10, g: 25, b: 30 },
    accent: { r: 80, g: 220, b: 200 },
    lines: [
      'QUE ES PLANIFICACION?',
      'Una POLITICA decide quien accede primero al recurso.',
      '',
      'POLITICAS:',
      '  FIFO: Primero en llegar, primero en pasar.',
      '  SJF:  El de menor tiempo de cruce pasa primero.',
      '  Round Robin: Cada carro tiene un quantum de tiempo.',
      '',
      'CONTROLES:',
      '  [SPACE]  Lanzar carro',
      '  [P]      Cambiar politica',
    ],
  },
  7: {
    title: 'MODO 7: DEADLOCK (Bloqueo Circular)',
    subtitle: 'Concepto: 2x Lock() adquiridos en orden inverso',
    bg: { r: 30, g: 10, b: 30 },
    accent: { r: 220, g: 80, b: 255 },
    lines: [
      'QUE ES UN DEADLOCK?',
      'Ocurre cuando dos hilos se bloquean mutuamente:',
      'cada uno tiene un recurso que el otro necesita.',
      '',
      'EN ESTE MODO:',
      'Hay 2 recursos: A y B.',
      '  Car 1 necesita: A primero, luego B',
      '  Car 2 necesita: B primero, luego A',
      'Si ambos adquieren su primer recurso -> DEADLOCK!',
      '',
      'CONTROLES:',
      '  [SPACE]  Lanzar par de carros',
      '  [E]      Toggle prevencion',
      '  [F]      Resolver deadlock',
    ],
  },
  8: {
    title: 'MODO 8: TODO BIEN - Sincronizacion Completa',
    subtitle: 'Integracion: Lock + Semaphore trabajando juntos',
    bg: { r: 10, g: 25, b: 15 },
    accent: { r: 80, g: 255, b: 150 },
    lines: [
      'SINCRONIZACION COMPLETA',
      'Este modo integra todos los mecanismos:',
      '',
      '  Interseccion = Lock() (mutex)',
      '  Puente       = Lock() (mutex)',
      '  Parqueo      = Semaphore(3)',
      '',
      'Cada recurso tiene su propio mecanismo de proteccion.',
      '',
      'CONTROLES:',
      '  [SPACE]  Lanzar carro al destino seleccionado',
      '  [I]      Destino: Interseccion',
      '  [B]      Destino: Puente',
      '  [P]      Destino: Parqueo',
      '  [0]      Destino: Automatico',
    ],
  },
};

export default function Simulator() {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5Ref = useRef<p5 | null>(null);
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
  });

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
    s.m1Cars = [];
    s.m1Collisions = 0;
    s.m1Flash = 0;
    s.selectedCar = null;
    resetCarId();
    s.eventsLog = [];
    addEvent('Modo 1: Sin control - Condiciones de carrera');
  }, [addEvent]);

  const m2Reset = useCallback(() => {
    const s = stateRef.current;
    s.m2Cars = [];
    s.m2Mutex.reset();
    s.selectedCar = null;
    resetCarId();
    s.eventsLog = [];
    addEvent('Modo 2: Seccion critica con Lock()');
  }, [addEvent]);

  const m3Reset = useCallback(() => {
    const s = stateRef.current;
    s.m3Cars = [];
    s.m3Mutex.reset();
    s.selectedCar = null;
    resetCarId();
    s.eventsLog = [];
    addEvent('Modo 3: Mutex - Lock() en puente');
  }, [addEvent]);

  const m4Reset = useCallback(() => {
    const s = stateRef.current;
    s.m4Cars = [];
    s.m4Cap = 3;
    s.m4Sem = new SimSemaphore('Parqueo', s.m4Cap);
    s.selectedCar = null;
    resetCarId();
    s.eventsLog = [];
    addEvent(`Modo 4: Semaforo - Semaphore(${s.m4Cap})`);
  }, [addEvent]);

  const m5Reset = useCallback(() => {
    const s = stateRef.current;
    s.m5Cars = [];
    s.m5Cap = 3;
    s.m5Mon = new SimMonitor('Monitor', s.m5Cap);
    s.selectedCar = null;
    resetCarId();
    s.eventsLog = [];
    addEvent('Modo 5: Monitor - Condition()');
  }, [addEvent]);

  const m6Reset = useCallback(() => {
    const s = stateRef.current;
    s.m6Cars = [];
    s.m6Mutex.reset();
    s.m6Queue = [];
    s.selectedCar = null;
    resetCarId();
    s.eventsLog = [];
    addEvent(`Modo 6: Planificacion - ${POLICY_NAMES[s.m6Policy]}`);
  }, [addEvent]);

  const m7Reset = useCallback(() => {
    const s = stateRef.current;
    s.m7Cars = [];
    s.m7RA.reset();
    s.m7RB.reset();
    s.m7Detected = false;
    s.m7Msg = '';
    s.selectedCar = null;
    resetCarId();
    s.eventsLog = [];
    addEvent('Modo 7: Deadlock - 2x Lock()');
  }, [addEvent]);

  const m8Reset = useCallback(() => {
    const s = stateRef.current;
    s.m8Cars = [];
    s.m8MutexInt.reset();
    s.m8MutexBr.reset();
    s.m8SemPark = new SimSemaphore('Parqueo', M8_PK_CAP);
    s.m8NextDest = 'auto';
    s.selectedCar = null;
    resetCarId();
    s.eventsLog = [];
    addEvent('Modo 8: Sincronizacion completa');
  }, [addEvent]);

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
    addEvent(`Car ${c.id} lanzado [${d}]`);
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
    addEvent(`Car ${c.id} creado`);
  }, [addEvent]);

  const m3Spawn = useCallback(() => {
    const s = stateRef.current;
    const c = new Car(10, Math.random() < 0.5 ? 300 : 340, 1, 0, 2 + Math.random() * 1.5);
    s.m3Cars.push(c);
    addEvent(`Car ${c.id} esperando puente`);
  }, [addEvent]);

  const m4Spawn = useCallback(() => {
    const s = stateRef.current;
    const c = new Car(200 + Math.random() * 600, H - 20, 0, -1, 1.5 + Math.random());
    s.m4Cars.push(c);
    addEvent(`Car ${c.id} busca parqueo`);
  }, [addEvent]);

  const m5Spawn = useCallback(() => {
    const s = stateRef.current;
    const c = new Car(200 + Math.random() * 600, H - 20, 0, -1, 1.5 + Math.random());
    s.m5Cars.push(c);
    addEvent(`Car ${c.id} -> Monitor.enter()`);
  }, [addEvent]);

  const m6Spawn = useCallback(() => {
    const s = stateRef.current;
    const c = new Car(10, Math.random() < 0.5 ? 300 : 340, 1, 0, 1.5 + Math.random() * 1.5);
    c.crossTime = 30 + Math.floor(Math.random() * 71);
    s.m6Cars.push(c);
    addEvent(`Car ${c.id} (cruce=${c.crossTime} frames)`);
  }, [addEvent]);

  const m7SpawnPair = useCallback(() => {
    const s = stateRef.current;
    s.m7Detected = false;
    s.m7Msg = '';
    s.m7RA.reset();
    s.m7RB.reset();
    const a = new Car(50, 310, 1, 0, 2.0);
    a.held = [];
    a.state = 'RUN';
    a.targetOrder = ['A', 'B'];
    s.m7Cars.push(a);
    const b = new Car(W - 50, 350, -1, 0, 2.0);
    b.held = [];
    b.state = 'RUN';
    if (s.m7Prevent) {
      b.targetOrder = ['A', 'B'];
      addEvent('Prevencion ON: ambos piden A->B');
    } else {
      b.targetOrder = ['B', 'A'];
      addEvent(`Car ${b.id} quiere B->A (orden inverso!)`);
    }
    s.m7Cars.push(b);
    addEvent(`Par lanzado: Car ${a.id} y Car ${b.id}`);
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
    addEvent(`Car ${c.id} destino: ${d}`);
  }, [addEvent]);

  // Force exit functions
  const m4ForceExit = useCallback((c: Car) => {
    const s = stateRef.current;
    s.m4Sem.release(c.id);
    c.state = 'RUN';
    c.framesIn = 0;
    c.parkSlot = null;
    c.dirY = 1;
    c.resume();
    addEvent(`Semaphore signal() manual - Car ${c.id}`);
  }, [addEvent]);

  const m5ForceExit = useCallback((c: Car) => {
    const s = stateRef.current;
    s.m5Mon.exit(c.id);
    c.state = 'RUN';
    c.framesIn = 0;
    c.parkSlot = null;
    c.dirY = 1;
    c.resume();
    addEvent(`Monitor.exit() manual - Car ${c.id}`);
  }, [addEvent]);

  const m7ForceResolve = useCallback(() => {
    const s = stateRef.current;
    for (const c of s.m7Cars) {
      if (c.state === 'DEADLOCK') {
        s.m7RA.release(c.id);
        s.m7RB.release(c.id);
        c.held = [];
        c.state = 'RUN';
        c.resume();
        c.waitFrames = 0;
      }
    }
    s.m7RA.reset();
    s.m7RB.reset();
    s.m7Detected = false;
    s.m7Msg = '';
    addEvent('Deadlock resuelto manualmente');
  }, [addEvent]);

  useEffect(() => {
    if (!containerRef.current) return;

    const sketch = (p: p5) => {
      const s = stateRef.current;

      // Step functions for each mode
      const m1Step = () => {
        if (s.m1Flash > 0) s.m1Flash--;
        if (p.frameCount % 70 === 0 && s.m1Cars.length < 10) m1Spawn();
        for (const c of [...s.m1Cars]) {
          if (c.offscreen()) {
            cleanCarFromAll(c);
            s.m1Cars = s.m1Cars.filter((x) => x.id !== c.id);
            continue;
          }
          c.state = 'RUN';
          c.move();
          if (c.inZone(ZONES.m1)) {
            for (const o of s.m1Cars) {
              if (o.id !== c.id && o.inZone(ZONES.m1)) {
                c.state = 'RACE_ERR';
                o.state = 'RACE_ERR';
                s.m1Collisions++;
                s.m1Flash = 15;
                if (s.m1Collisions % 3 === 1) {
                  addEvent(`COLISION! Car ${c.id} y Car ${o.id}`);
                }
              }
            }
          }
        }
      };

      const m2Step = () => {
        if (p.frameCount % 80 === 0 && s.m2Cars.length < 8) m2Spawn();
        for (const c of [...s.m2Cars]) {
          if (c.offscreen()) {
            cleanCarFromAll(c);
            s.m2Mutex.release(c.id);
            s.m2Cars = s.m2Cars.filter((x) => x.id !== c.id);
            continue;
          }
          const appr = c.approaching(ZONES.m2);
          const inside = c.inZone(ZONES.m2);
          if (appr && !inside) {
            if (s.m2Mutex.tryAcquire(c.id)) {
              c.state = 'IN_CS';
              c.resume();
              c.move();
              addEvent(`Car ${c.id} ENTRO a seccion critica`);
            } else {
              c.state = 'WAIT';
              c.stop();
            }
          } else if (inside) {
            c.state = 'IN_CS';
            c.resume();
            c.move();
          } else if (c.state === 'WAIT') {
            if (s.m2Mutex.tryAcquire(c.id)) {
              c.state = 'IN_CS';
              c.resume();
              c.move();
              addEvent(`Car ${c.id} ENTRO a seccion critica`);
            }
          } else {
            if (s.m2Mutex.owner === c.id) {
              s.m2Mutex.release(c.id);
              addEvent(`Car ${c.id} SALIO de seccion critica`);
            }
            c.state = 'RUN';
            c.resume();
            c.move();
          }
        }
      };

      const m3Step = () => {
        if (p.frameCount % 60 === 0 && s.m3Cars.length < 10) m3Spawn();
        for (const c of [...s.m3Cars]) {
          if (c.offscreen()) {
            cleanCarFromAll(c);
            s.m3Mutex.release(c.id);
            s.m3Cars = s.m3Cars.filter((x) => x.id !== c.id);
            continue;
          }
          const appr = c.approaching(ZONES.m3Bridge, 40);
          const inside = c.inZone(ZONES.m3Bridge);
          if (appr && !inside) {
            if (s.m3Mutex.tryAcquire(c.id)) {
              c.state = 'IN_CS';
              c.resume();
              c.move();
              addEvent(`Mutex ACQUIRED by Car ${c.id}`);
            } else {
              c.state = 'WAIT_MUTEX';
              c.stop();
            }
          } else if (inside) {
            c.state = 'IN_CS';
            c.resume();
            c.move();
          } else if (c.state === 'WAIT_MUTEX') {
            if (s.m3Mutex.tryAcquire(c.id)) {
              c.state = 'IN_CS';
              c.resume();
              c.move();
              addEvent(`Mutex ACQUIRED by Car ${c.id}`);
            }
          } else {
            if (s.m3Mutex.owner === c.id) {
              s.m3Mutex.release(c.id);
              addEvent(`Mutex RELEASED by Car ${c.id}`);
            }
            c.state = 'RUN';
            c.resume();
            c.move();
          }
        }
      };

      const m4SlotPos = (idx: number) => ({ x: M4_PX + idx * (M4_SW + 20), y: M4_PY });

      const m4Step = () => {
        if (p.frameCount % 70 === 0 && s.m4Cars.length < 10) m4Spawn();
        const entryY = M4_PY + M4_SH + 60;
        for (const c of [...s.m4Cars]) {
          if (c.offscreen()) {
            cleanCarFromAll(c);
            s.m4Sem.release(c.id);
            s.m4Cars = s.m4Cars.filter((x) => x.id !== c.id);
            continue;
          }
          if (c.state === 'PARKED') {
            c.framesIn++;
            if (c.framesIn > 180) m4ForceExit(c);
            continue;
          }
          if (c.state === 'WAIT_SEM') {
            if (s.m4Sem.tryAcquire(c.id)) {
              c.state = 'PARKED';
              c.stop();
              c.framesIn = 0;
              const slot = firstFreeSlot(s.m4Cars, s.m4Cap);
              c.parkSlot = slot;
              const pos = m4SlotPos(slot);
              c.x = pos.x + M4_SW / 2;
              c.y = pos.y + M4_SH / 2;
              addEvent(`Sem wait() OK - Car ${c.id}`);
            }
            continue;
          }
          if (c.dirY < 0 && c.y <= entryY) {
            if (s.m4Sem.tryAcquire(c.id)) {
              c.state = 'PARKED';
              c.stop();
              c.framesIn = 0;
              const slot = firstFreeSlot(s.m4Cars, s.m4Cap);
              c.parkSlot = slot;
              const pos = m4SlotPos(slot);
              c.x = pos.x + M4_SW / 2;
              c.y = pos.y + M4_SH / 2;
              addEvent(`Sem wait() OK - Car ${c.id}`);
            } else {
              c.state = 'WAIT_SEM';
              c.stop();
            }
          } else {
            c.state = 'RUN';
            c.move();
          }
        }
      };

      const m5Step = () => {
        if (p.frameCount % 70 === 0 && s.m5Cars.length < 10) m5Spawn();
        const entryY = M5_PY + M5_SH + 60;
        for (const c of [...s.m5Cars]) {
          if (c.offscreen()) {
            cleanCarFromAll(c);
            s.m5Mon.exit(c.id);
            s.m5Cars = s.m5Cars.filter((x) => x.id !== c.id);
            continue;
          }
          if (c.state === 'PARKED') {
            c.framesIn++;
            if (c.framesIn > 180) m5ForceExit(c);
            continue;
          }
          if (c.state === 'WAIT_MON') {
            if (s.m5Mon.tryEnter(c.id)) {
              c.state = 'PARKED';
              c.stop();
              c.framesIn = 0;
              const slot = firstFreeSlot(s.m5Cars, s.m5Cap);
              c.parkSlot = slot;
              c.x = M5_PX + slot * (M5_SW + 20) + M5_SW / 2;
              c.y = M5_PY + M5_SH / 2;
              addEvent(`Monitor.enter() OK - Car ${c.id}`);
            }
            continue;
          }
          if (c.dirY < 0 && c.y <= entryY) {
            if (s.m5Mon.tryEnter(c.id)) {
              c.state = 'PARKED';
              c.stop();
              c.framesIn = 0;
              const slot = firstFreeSlot(s.m5Cars, s.m5Cap);
              c.parkSlot = slot;
              c.x = M5_PX + slot * (M5_SW + 20) + M5_SW / 2;
              c.y = M5_PY + M5_SH / 2;
              addEvent(`Monitor.enter() OK - Car ${c.id}`);
            } else {
              c.state = 'WAIT_MON';
              c.stop();
            }
          } else {
            c.state = 'RUN';
            c.move();
          }
        }
      };

      const m6Next = (): Car | null => {
        if (s.m6Queue.length === 0) return null;
        if (s.m6Policy === 0) return s.m6Queue[0];
        if (s.m6Policy === 1) {
          return s.m6Queue.reduce((min, c) => (c.crossTime < min.crossTime ? c : min), s.m6Queue[0]);
        }
        return s.m6Queue[0];
      };

      const m6Step = () => {
        if (p.frameCount % 55 === 0 && s.m6Cars.length < 10) m6Spawn();
        for (const c of [...s.m6Cars]) {
          if (c.offscreen()) {
            cleanCarFromAll(c);
            s.m6Mutex.release(c.id);
            s.m6Queue = s.m6Queue.filter((x) => x.id !== c.id);
            s.m6Cars = s.m6Cars.filter((x) => x.id !== c.id);
            continue;
          }
          const appr = c.approaching(ZONES.m6Bridge, 40);
          const inside = c.inZone(ZONES.m6Bridge);
          if (c.state === 'WAIT_MUTEX' && !appr && !inside) {
            if (!s.m6Queue.includes(c)) s.m6Queue.push(c);
            const nxt = m6Next();
            if (nxt === c && s.m6Mutex.tryAcquire(c.id)) {
              s.m6Queue = s.m6Queue.filter((x) => x.id !== c.id);
              c.state = 'IN_CS';
              c.resume();
              c.framesIn = 0;
              c.move();
              addEvent(`Car ${c.id} entra puente (${POLICY_NAMES[s.m6Policy]})`);
            }
            continue;
          }
          if (appr && !inside && c.state !== 'IN_CS') {
            if (!s.m6Queue.includes(c)) s.m6Queue.push(c);
            const nxt = m6Next();
            if (nxt === c && s.m6Mutex.tryAcquire(c.id)) {
              s.m6Queue = s.m6Queue.filter((x) => x.id !== c.id);
              c.state = 'IN_CS';
              c.resume();
              c.framesIn = 0;
              c.move();
              addEvent(`Car ${c.id} entra puente (${POLICY_NAMES[s.m6Policy]})`);
            } else {
              c.state = 'WAIT_MUTEX';
              c.stop();
            }
          } else if (inside) {
            c.state = 'IN_CS';
            c.resume();
            c.framesIn++;
            if (s.m6Policy === 2 && c.framesIn >= M6_RR_QUANTUM) {
              s.m6Mutex.release(c.id);
              c.state = 'RUN';
              c.x = ZONES.m6Bridge.x - 25;
              c.framesIn = 0;
              s.m6Queue.push(c);
              addEvent(`RR quantum! Car ${c.id} vuelve a cola`);
              continue;
            }
            c.move();
          } else {
            if (s.m6Mutex.owner === c.id) {
              s.m6Mutex.release(c.id);
              addEvent(`Car ${c.id} cruzo puente`);
            }
            s.m6Queue = s.m6Queue.filter((x) => x.id !== c.id);
            c.state = 'RUN';
            c.resume();
            c.move();
          }
        }
      };

      const m7GetMutex = (res: string) => (res === 'A' ? s.m7RA : s.m7RB);

      const m7Step = () => {
        for (const c of [...s.m7Cars]) {
          if (c.offscreen()) {
            cleanCarFromAll(c);
            s.m7RA.release(c.id);
            s.m7RB.release(c.id);
            s.m7Cars = s.m7Cars.filter((x) => x.id !== c.id);
            continue;
          }
          if (c.state === 'DEADLOCK') continue;
          if (!c.targetOrder) continue;
          let needed: string | null = null;
          for (const r of c.targetOrder) {
            if (!c.held.includes(r)) {
              needed = r;
              break;
            }
          }
          if (needed === null) {
            c.state = 'RUN';
            c.resume();
            c.move();
            continue;
          }
          const mx = m7GetMutex(needed);
          if (mx.tryAcquire(c.id)) {
            c.held.push(needed);
            c.state = 'IN_CS';
            addEvent(`Car ${c.id} adquirio ${needed}`);
            c.resume();
            c.move();
          } else {
            c.state = 'WAIT_MUTEX';
            c.stop();
            c.waitFrames++;
            if (c.waitFrames > 30) {
              const oA = s.m7RA.owner;
              const oB = s.m7RB.owner;
              if (oA && oB && oA !== oB) {
                const cA = getCarById(s.m7Cars, oA);
                const cB = getCarById(s.m7Cars, oB);
                if (cA && cB && cA.held && cB.held) {
                  if (
                    cA.held.includes('A') &&
                    !cA.held.includes('B') &&
                    cB.held.includes('B') &&
                    !cB.held.includes('A')
                  ) {
                    s.m7Detected = true;
                    s.m7Msg = `Car ${cA.id} tiene A, espera B | Car ${cB.id} tiene B, espera A`;
                    cA.state = 'DEADLOCK';
                    cB.state = 'DEADLOCK';
                    addEvent('DEADLOCK DETECTADO!');
                  }
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
            cleanCarFromAll(c);
            s.m8MutexInt.release(c.id);
            s.m8MutexBr.release(c.id);
            s.m8SemPark.release(c.id);
            s.m8Cars = s.m8Cars.filter((x) => x.id !== c.id);
            continue;
          }
          if (!c.dest) c.dest = 'int';

          if (c.dest === 'int') {
            const appr = c.approaching(ZONES.m8Int, 35);
            const inside = c.inZone(ZONES.m8Int);
            if (appr && !inside) {
              if (s.m8MutexInt.tryAcquire(c.id)) {
                c.state = 'IN_CS';
                c.resume();
                c.move();
              } else {
                c.state = 'WAIT_MUTEX';
                c.stop();
              }
            } else if (inside) {
              c.state = 'IN_CS';
              c.resume();
              c.move();
            } else if (c.state === 'WAIT_MUTEX') {
              if (s.m8MutexInt.tryAcquire(c.id)) {
                c.state = 'IN_CS';
                c.resume();
                c.move();
              }
            } else {
              if (s.m8MutexInt.owner === c.id) s.m8MutexInt.release(c.id);
              c.state = 'RUN';
              c.resume();
              c.move();
            }
          } else if (c.dest === 'br') {
            const appr = c.approaching(ZONES.m8Br, 35);
            const inside = c.inZone(ZONES.m8Br);
            if (appr && !inside) {
              if (s.m8MutexBr.tryAcquire(c.id)) {
                c.state = 'IN_CS';
                c.resume();
                c.move();
              } else {
                c.state = 'WAIT_MUTEX';
                c.stop();
              }
            } else if (inside) {
              c.state = 'IN_CS';
              c.resume();
              c.move();
            } else if (c.state === 'WAIT_MUTEX') {
              if (s.m8MutexBr.tryAcquire(c.id)) {
                c.state = 'IN_CS';
                c.resume();
                c.move();
              }
            } else {
              if (s.m8MutexBr.owner === c.id) s.m8MutexBr.release(c.id);
              c.state = 'RUN';
              c.resume();
              c.move();
            }
          } else if (c.dest === 'pk') {
            if (c.state === 'PARKED') {
              c.framesIn++;
              if (c.framesIn > 150) {
                s.m8SemPark.release(c.id);
                c.state = 'RUN';
                c.framesIn = 0;
                c.parkSlot = null;
                c.dirY = 1;
                c.resume();
              }
              continue;
            }
            if (c.state === 'WAIT_SEM') {
              if (s.m8SemPark.tryAcquire(c.id)) {
                c.state = 'PARKED';
                c.stop();
                c.framesIn = 0;
                const slot = firstFreeSlot(s.m8Cars, M8_PK_CAP);
                c.parkSlot = slot;
                c.x = ZONES.m8Pk.x + 20 + slot * 35;
                c.y = ZONES.m8Pk.y + ZONES.m8Pk.h / 2;
              }
              continue;
            }
            if (c.dirY < 0 && c.y <= ZONES.m8Pk.y + ZONES.m8Pk.h + 40) {
              if (s.m8SemPark.tryAcquire(c.id)) {
                c.state = 'PARKED';
                c.stop();
                c.framesIn = 0;
                const slot = firstFreeSlot(s.m8Cars, M8_PK_CAP);
                c.parkSlot = slot;
                c.x = ZONES.m8Pk.x + 20 + slot * 35;
                c.y = ZONES.m8Pk.y + ZONES.m8Pk.h / 2;
              } else {
                c.state = 'WAIT_SEM';
                c.stop();
              }
            } else {
              c.state = 'RUN';
              c.move();
            }
          }
        }
      };

      // Draw functions
      const m1Draw = () => {
        drawSceneBg(p);
        drawHRoad(p, 0, 270, W, 200);
        drawVRoad(p, 500, 0, 200, H);
        drawCrosswalks(p, ZONES.m1);

        const blink = Math.floor(p.frameCount / 20) % 2 === 0 ? 'yellow' : 'off';
        drawTrafficLight(p, ZONES.m1.x - 42, ZONES.m1.y + 40, blink, true, 0.9);
        drawTrafficLight(p, ZONES.m1.x + ZONES.m1.w + 42, ZONES.m1.y + ZONES.m1.h - 40, blink, true, 0.9);
        drawTrafficLight(p, ZONES.m1.x + 40, ZONES.m1.y - 42, blink, false, 0.9);
        drawTrafficLight(p, ZONES.m1.x + ZONES.m1.w - 40, ZONES.m1.y + ZONES.m1.h + 42, blink, false, 0.9);

        if (s.m1Flash > 0) {
          p.fill(255, 60, 60, 90 + s.m1Flash * 6);
          p.stroke(255, 90, 90, 170);
          p.strokeWeight(3);
          p.rect(ZONES.m1.x, ZONES.m1.y, ZONES.m1.w, ZONES.m1.h, 8);
        } else {
          p.fill(90, 95, 110, 110);
          p.stroke(255, 110);
          p.strokeWeight(2);
          p.rect(ZONES.m1.x, ZONES.m1.y, ZONES.m1.w, ZONES.m1.h, 8);
        }

        p.fill(255, 180);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(14);
        p.text('CRUCE SIN SEMAFORO', ZONES.m1.x + ZONES.m1.w / 2, ZONES.m1.y + ZONES.m1.h / 2);

        for (const c of s.m1Cars) c.draw(p, s.selectedCar === c);

        drawPanel(p, 10, 10, 420, 70);
        drawLabel(p, 'MODO 1: SIN CONTROL - Condiciones de Carrera', 20, 18, 13, { r: 255, g: 200, b: 50 });
        drawLabel(p, 'Cruce sin semaforo. Si dos carros entran, chocan.', 20, 36, 11, { r: 200, g: 200, b: 200 });
        drawLabel(p, `Colisiones: ${s.m1Collisions}   Carros: ${s.m1Cars.length}`, 20, 54, 11, { r: 255, g: 80, b: 80 });
        drawPanel(p, 10, H - 55, 500, 45);
        drawLabel(p, '[SPACE] Lanzar   [H] Horizontal   [V] Vertical', 20, H - 45, 10, { r: 180, g: 180, b: 180 });
      };

      const m2Draw = () => {
        drawSceneBg(p);
        drawHRoad(p, 0, 270, W, 200);
        drawVRoad(p, 500, 0, 200, H);
        drawCrosswalks(p, ZONES.m2);

        const [hLight, vLight] = mutexLightStates(s.m2Cars, s.m2Mutex, p.frameCount);
        drawTrafficLight(p, ZONES.m2.x - 42, ZONES.m2.y + 40, hLight, true, 0.9);
        drawTrafficLight(p, ZONES.m2.x + ZONES.m2.w + 42, ZONES.m2.y + ZONES.m2.h - 40, hLight, true, 0.9);
        drawTrafficLight(p, ZONES.m2.x + 40, ZONES.m2.y - 42, vLight, false, 0.9);
        drawTrafficLight(p, ZONES.m2.x + ZONES.m2.w - 40, ZONES.m2.y + ZONES.m2.h + 42, vLight, false, 0.9);

        if (s.m2Mutex.owner) {
          p.fill(50, 180, 80, 78);
        } else {
          p.fill(90, 95, 110, 110);
        }
        p.stroke(50, 220, 110, 180);
        p.strokeWeight(2);
        p.rect(ZONES.m2.x, ZONES.m2.y, ZONES.m2.w, ZONES.m2.h, 8);

        p.fill(255, 180);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(14);
        p.text('INTERSECCION PROTEGIDA', ZONES.m2.x + ZONES.m2.w / 2, ZONES.m2.y + ZONES.m2.h / 2);

        for (const c of s.m2Cars) c.draw(p, s.selectedCar === c);

        drawPanel(p, 10, 10, 450, 70);
        drawLabel(p, 'MODO 2: SECCION CRITICA - Lock()', 20, 18, 13, { r: 255, g: 200, b: 50 });
        drawLabel(p, 'Solo un carro puede estar en el cruce a la vez.', 20, 36, 11, { r: 200, g: 200, b: 200 });
        drawLabel(p, `Owner: ${s.m2Mutex.owner ?? 'None'}  |  Cola: [${s.m2Mutex.queue.join(', ')}]`, 20, 54, 11, { r: 100, g: 200, b: 255 });
        drawPanel(p, 10, H - 55, 500, 45);
        drawLabel(p, '[SPACE] Lanzar   [H] Horizontal   [V] Vertical', 20, H - 45, 10, { r: 180, g: 180, b: 180 });
      };

      const m3Draw = () => {
        drawSceneBg(p);
        drawWater(p, 360, 180, 480, 280);
        drawHRoad(p, 0, 270, 380, 100);
        drawHRoad(p, 820, 270, W - 820, 100);

        p.fill(118, 90, 62);
        p.stroke(185, 155, 110);
        p.strokeWeight(3);
        p.rect(ZONES.m3Bridge.x, ZONES.m3Bridge.y, ZONES.m3Bridge.w, ZONES.m3Bridge.h, 8);

        const light = !s.m3Mutex.owner ? 'green' : 'red';
        drawTrafficLight(p, ZONES.m3Bridge.x - 36, ZONES.m3Bridge.y + ZONES.m3Bridge.h / 2, light, true, 0.85);
        drawTrafficLight(p, ZONES.m3Bridge.x + ZONES.m3Bridge.w + 36, ZONES.m3Bridge.y + ZONES.m3Bridge.h / 2, light, true, 0.85);

        p.fill(255, 205);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(16);
        p.text('PUENTE ANGOSTO', ZONES.m3Bridge.x + ZONES.m3Bridge.w / 2, ZONES.m3Bridge.y + ZONES.m3Bridge.h / 2);

        for (const c of s.m3Cars) c.draw(p, s.selectedCar === c);

        drawPanel(p, 10, 10, 460, 70);
        drawLabel(p, 'MODO 3: MUTEX - Lock() acquire()/release()', 20, 18, 13, { r: 255, g: 200, b: 50 });
        drawLabel(p, 'Un solo vehiculo cruza el puente.', 20, 36, 11, { r: 200, g: 200, b: 200 });
        drawLabel(p, `Owner: ${s.m3Mutex.owner ?? 'None'}  |  Cola: [${s.m3Mutex.queue.join(', ')}]`, 20, 54, 11, { r: 100, g: 200, b: 255 });
        drawPanel(p, 10, H - 55, 420, 45);
        drawLabel(p, '[SPACE] Lanzar carro', 20, H - 45, 10, { r: 180, g: 180, b: 180 });
      };

      const m4Draw = () => {
        drawSceneBg(p);
        drawVRoad(p, W / 2 - 60, M4_PY + M4_SH + 40, 120, H - M4_PY - M4_SH - 40);

        const lotW = s.m4Cap * (M4_SW + 20) + 40;
        p.fill(52, 54, 58);
        p.noStroke();
        p.rect(M4_PX - 30, M4_PY - 40, lotW, M4_SH + 85, 12);
        drawParkingSign(p, M4_PX - 60, M4_PY + 20);
        drawDigitalBoard(p, M4_PX + lotW - 150, M4_PY - 52, 120, 48, 'DISP.', `${s.m4Sem.available()}/${s.m4Cap}`, s.m4Sem.available() > 0);
        drawBarrier(p, W / 2, M4_PY + M4_SH + 28, s.m4Sem.available() > 0, false);

        const occupiedSlots = getParkedSlots(s.m4Cars);
        for (let i = 0; i < s.m4Cap; i++) {
          const sx = M4_PX + i * (M4_SW + 20);
          const occ = occupiedSlots.has(i);
          p.noFill();
          p.stroke(250, 250, 250, 150);
          p.strokeWeight(3);
          p.rect(sx, M4_PY, M4_SW, M4_SH, 8);
          if (occ) {
            p.fill(50, 170, 90, 35);
            p.noStroke();
            p.rect(sx + 6, M4_PY + 6, M4_SW - 12, M4_SH - 12, 8);
          }
          p.fill(235);
          p.textAlign(p.CENTER, p.CENTER);
          p.textSize(11);
          p.text(`P${i + 1}`, sx + M4_SW / 2, M4_PY + 24);
        }

        for (const c of s.m4Cars) c.draw(p, s.selectedCar === c);

        drawPanel(p, 10, 10, 520, 70);
        drawLabel(p, `MODO 4: SEMAFORO - Semaphore(${s.m4Cap})`, 20, 18, 13, { r: 255, g: 200, b: 50 });
        drawLabel(p, 'Contador visual de cupos + barrera de entrada.', 20, 36, 11, { r: 200, g: 200, b: 200 });
        drawLabel(p, `Cupos: ${s.m4Sem.available()}/${s.m4Cap}  |  Dentro: [${s.m4Sem.inside.join(', ')}]`, 20, 54, 11, { r: 100, g: 200, b: 255 });
        drawPanel(p, 10, H - 55, 590, 45);
        drawLabel(p, `[SPACE] Lanzar  [K] Cambiar cupos (${s.m4Cap})  [Click carro verde] Forzar salida`, 20, H - 45, 10, { r: 180, g: 180, b: 180 });
      };

      const m5Draw = () => {
        drawSceneBg(p);
        drawVRoad(p, W / 2 - 60, M5_PY + M5_SH + 40, 120, H - M5_PY - M5_SH - 40);

        const lotW = s.m5Cap * (M5_SW + 20) + 40;
        p.fill(58, 60, 76);
        p.noStroke();
        p.rect(M5_PX - 30, M5_PY - 52, lotW, M5_SH + 95, 12);
        p.fill(108, 86, 170);
        p.rect(M5_PX - 30, M5_PY - 52, lotW, 28, 12, 12, 0, 0);
        drawParkingSign(p, M5_PX - 60, M5_PY + 18, 'M');
        drawDigitalBoard(p, M5_PX + lotW - 160, M5_PY - 66, 130, 52, 'QUEUE', String(s.m5Mon.queue.length), s.m5Mon.queue.length === 0);
        drawBarrier(p, W / 2, M5_PY + M5_SH + 28, s.m5Mon.inside.length < s.m5Cap, false);

        const occupiedSlots = getParkedSlots(s.m5Cars);
        for (let i = 0; i < s.m5Cap; i++) {
          const sx = M5_PX + i * (M5_SW + 20);
          const occ = occupiedSlots.has(i);
          p.noFill();
          p.stroke(170, 180, 255, 170);
          p.strokeWeight(3);
          p.rect(sx, M5_PY, M5_SW, M5_SH, 8);
          if (occ) {
            p.fill(70, 140, 220, 38);
            p.noStroke();
            p.rect(sx + 6, M5_PY + 6, M5_SW - 12, M5_SH - 12, 8);
          }
          p.fill(235);
          p.textAlign(p.CENTER, p.CENTER);
          p.textSize(11);
          p.text(`Dock ${i + 1}`, sx + M5_SW / 2, M5_PY + 24);
        }

        p.fill(255, 180);
        p.textAlign(p.LEFT, p.CENTER);
        p.textSize(14);
        p.text('ESTACION MONITOR', M5_PX - 10, M5_PY - 34);

        for (const c of s.m5Cars) c.draw(p, s.selectedCar === c);

        drawPanel(p, 10, 10, 540, 70);
        drawLabel(p, 'MODO 5: MONITOR - Condition() enter()/exit()', 20, 18, 13, { r: 255, g: 200, b: 50 });
        drawLabel(p, 'Cabina de control + darsenas para el monitor.', 20, 36, 11, { r: 200, g: 200, b: 200 });
        drawLabel(p, `Dentro: [${s.m5Mon.inside.join(', ')}]  |  Cola: [${s.m5Mon.queue.join(', ')}]`, 20, 54, 11, { r: 100, g: 200, b: 255 });
        drawPanel(p, 10, H - 55, 520, 45);
        drawLabel(p, '[SPACE] Lanzar   [Click carro verde] Monitor.exit()', 20, H - 45, 10, { r: 180, g: 180, b: 180 });
      };

      const m6Draw = () => {
        drawSceneBg(p);
        drawWater(p, 480, 190, 390, 260);
        drawHRoad(p, 0, 270, 480, 100);
        drawHRoad(p, 870, 270, W - 870, 100);

        p.fill(118, 90, 62);
        p.stroke(185, 155, 110);
        p.strokeWeight(3);
        p.rect(ZONES.m6Bridge.x, ZONES.m6Bridge.y, ZONES.m6Bridge.w, ZONES.m6Bridge.h, 8);

        drawDigitalBoard(p, 400, 200, 110, 48, 'POL.', POLICY_NAMES[s.m6Policy], true);
        drawBarrier(p, 474, 320, s.m6Mutex.owner === null, false);

        p.fill(255, 205);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(16);
        p.text(`PUENTE (${POLICY_NAMES[s.m6Policy]})`, ZONES.m6Bridge.x + ZONES.m6Bridge.w / 2, ZONES.m6Bridge.y + ZONES.m6Bridge.h / 2);

        for (const c of s.m6Cars) c.draw(p, s.selectedCar === c);

        drawPanel(p, 10, 10, 560, 85);
        drawLabel(p, `MODO 6: PLANIFICACION - ${POLICY_NAMES[s.m6Policy]}`, 20, 18, 13, { r: 255, g: 200, b: 50 });
        drawLabel(p, 'Cabina de peaje + puente para mostrar la cola.', 20, 36, 11, { r: 200, g: 200, b: 200 });
        const qInfo = s.m6Queue.map((c) => `C${c.id}(t=${c.crossTime})`).join(', ');
        drawLabel(p, `Cola: ${qInfo || 'vacia'}`, 20, 54, 11, { r: 200, g: 200, b: 200 });
        drawLabel(p, s.m6Policy === 2 ? `Quantum: ${M6_RR_QUANTUM} frames` : `Owner: ${s.m6Mutex.owner}`, 20, 72, 11, { r: 100, g: 200, b: 255 });
        drawPanel(p, 10, H - 55, 530, 45);
        drawLabel(p, `[SPACE] Lanzar  [P] Politica (${POLICY_NAMES[s.m6Policy]})`, 20, H - 45, 10, { r: 180, g: 180, b: 180 });
      };

      const m7Draw = () => {
        drawSceneBg(p);
        drawHRoad(p, 0, 260, W, 160);
        drawResourceGate(p, ZONES.m7ZoneA, 'RECURSO A', { r: 90, g: 210, b: 120 }, s.m7RA.owner, 'Lock()');
        drawResourceGate(p, ZONES.m7ZoneB, 'RECURSO B', { r: 110, g: 140, b: 255 }, s.m7RB.owner, 'Lock()');

        if (s.m7Detected) {
          p.stroke(255, 70, 70, 210);
          p.strokeWeight(4);
          p.line(ZONES.m7ZoneA.x + ZONES.m7ZoneA.w, 300, ZONES.m7ZoneB.x, 300);
          p.line(ZONES.m7ZoneB.x, 360, ZONES.m7ZoneA.x + ZONES.m7ZoneA.w, 360);
          p.fill(255, 65, 65);
          p.textAlign(p.CENTER, p.CENTER);
          p.textSize(22);
          p.text('DEADLOCK!', W / 2, 225);
          p.fill(255, 120, 120);
          p.textSize(12);
          p.text(s.m7Msg, W / 2, 205);
        }

        for (const c of s.m7Cars) c.draw(p, s.selectedCar === c);

        drawPanel(p, 10, 10, 560, 85);
        drawLabel(p, 'MODO 7: DEADLOCK - 2x Lock() en orden inverso', 20, 18, 13, { r: 255, g: 200, b: 50 });
        drawLabel(p, 'Los recursos son puertas bloqueadas para ver la espera circular.', 20, 36, 11, { r: 200, g: 200, b: 200 });
        drawLabel(p, `Prevencion: ${s.m7Prevent ? 'ON' : 'OFF'}  |  Deadlock: ${s.m7Detected ? 'SI!' : 'No'}`, 20, 54, 11, s.m7Detected ? { r: 255, g: 80, b: 80 } : { r: 100, g: 200, b: 255 });
        drawLabel(p, `A owner: ${s.m7RA.owner}  B owner: ${s.m7RB.owner}`, 20, 72, 11, { r: 200, g: 200, b: 200 });
        drawPanel(p, 10, H - 55, 580, 45);
        drawLabel(p, `[SPACE] Lanzar par  [E] Prevencion (${s.m7Prevent ? 'ON' : 'OFF'})  [F] Resolver`, 20, H - 45, 10, { r: 180, g: 180, b: 180 });
      };

      const m8Draw = () => {
        drawSceneBg(p);
        drawWater(p, 630, 248, 240, 146);
        drawHRoad(p, 0, 280, 650, 100);
        drawHRoad(p, 650, 280, 300, 80);
        drawVRoad(p, 280, 0, 120, 280);
        drawVRoad(p, 280, 380, 120, H - 380);
        drawVRoad(p, 880, ZONES.m8Pk.y + ZONES.m8Pk.h, 40, H - ZONES.m8Pk.y - ZONES.m8Pk.h);
        drawCrosswalks(p, ZONES.m8Int);

        const [hLight, vLight] = mutexLightStates(s.m8Cars, s.m8MutexInt, p.frameCount);
        drawTrafficLight(p, ZONES.m8Int.x - 34, ZONES.m8Int.y + 34, hLight, true, 0.8);
        drawTrafficLight(p, ZONES.m8Int.x + ZONES.m8Int.w + 34, ZONES.m8Int.y + ZONES.m8Int.h - 34, hLight, true, 0.8);
        drawTrafficLight(p, ZONES.m8Int.x + 34, ZONES.m8Int.y - 34, vLight, false, 0.8);
        drawTrafficLight(p, ZONES.m8Int.x + ZONES.m8Int.w - 34, ZONES.m8Int.y + ZONES.m8Int.h + 34, vLight, false, 0.8);

        if (s.m8MutexInt.owner) p.fill(50, 180, 80, 70);
        else p.fill(80, 85, 95, 110);
        p.stroke(100, 200, 100, 120);
        p.strokeWeight(2);
        p.rect(ZONES.m8Int.x, ZONES.m8Int.y, ZONES.m8Int.w, ZONES.m8Int.h, 8);
        p.fill(255, 160);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(11);
        p.text('INTERSECCION', ZONES.m8Int.x + ZONES.m8Int.w / 2, ZONES.m8Int.y + ZONES.m8Int.h / 2);

        p.fill(118, 90, 62);
        p.stroke(185, 155, 110);
        p.strokeWeight(3);
        p.rect(ZONES.m8Br.x, ZONES.m8Br.y, ZONES.m8Br.w, ZONES.m8Br.h, 8);
        drawTrafficLight(p, ZONES.m8Br.x - 28, ZONES.m8Br.y + ZONES.m8Br.h / 2, !s.m8MutexBr.owner ? 'green' : 'red', true, 0.75);
        p.fill(255, 160);
        p.textSize(11);
        p.text('PUENTE', ZONES.m8Br.x + ZONES.m8Br.w / 2, ZONES.m8Br.y + ZONES.m8Br.h / 2);

        p.fill(52, 54, 58);
        p.noStroke();
        p.rect(ZONES.m8Pk.x - 18, ZONES.m8Pk.y - 22, 136, 100, 12);
        drawParkingSign(p, ZONES.m8Pk.x - 38, ZONES.m8Pk.y + 10);
        drawDigitalBoard(p, ZONES.m8Pk.x + 126, ZONES.m8Pk.y - 12, 82, 40, 'PARK', `${s.m8SemPark.available()}/${M8_PK_CAP}`, s.m8SemPark.available() > 0);
        drawBarrier(p, 900, ZONES.m8Pk.y + ZONES.m8Pk.h + 10, s.m8SemPark.available() > 0, false);

        const occ = getParkedSlots(s.m8Cars);
        for (let i = 0; i < M8_PK_CAP; i++) {
          const sx = ZONES.m8Pk.x + 3 + i * 35;
          p.noFill();
          p.stroke(255, 255, 255, 150);
          p.strokeWeight(2);
          p.rect(sx, ZONES.m8Pk.y + 6, 28, 58, 4);
          if (occ.has(i)) {
            p.fill(50, 170, 90, 35);
            p.noStroke();
            p.rect(sx + 3, ZONES.m8Pk.y + 9, 22, 52, 4);
          }
        }

        for (const c of s.m8Cars) c.draw(p, s.selectedCar === c);

        drawPanel(p, 10, 10, 620, 85);
        drawLabel(p, 'MODO 8: SINCRONIZACION COMPLETA - ciudad integrada', 20, 18, 13, { r: 255, g: 200, b: 50 });
        drawLabel(p, 'Semaforos, puente y parqueo sin tocar la logica.', 20, 36, 11, { r: 200, g: 200, b: 200 });
        drawLabel(p, `Int: ${s.m8MutexInt.owner}  |  Puente: ${s.m8MutexBr.owner}  |  Park: ${s.m8SemPark.available()}/${M8_PK_CAP}`, 20, 54, 11, { r: 100, g: 200, b: 255 });
        drawLabel(p, `Proximo destino: ${s.m8NextDest}`, 20, 72, 11, { r: 200, g: 200, b: 200 });
        drawPanel(p, 10, H - 55, 610, 45);
        drawLabel(p, '[SPACE] Lanzar  [I] Int  [B] Puente  [P] Parqueo  [0] Auto', 20, H - 45, 10, { r: 180, g: 180, b: 180 });
      };

      const drawGlobalHUD = () => {
        drawPanel(p, W - 380, H - 180, 370, 170);
        drawLabel(p, 'EVENTOS:', W - 370, H - 172, 11, { r: 100, g: 200, b: 255 });
        for (let i = 0; i < Math.min(9, s.eventsLog.length); i++) {
          drawLabel(p, '> ' + s.eventsLog[i], W - 370, H - 157 + i * 15, 9, { r: 200, g: 200, b: 200 });
        }

        drawPanel(p, W - 380, H - 220, 370, 35);
        const lx = W - 368;
        const ly = H - 202;
        drawStatusChip(p, lx, ly, COLORS.C_RUN, 'RUN');
        drawStatusChip(p, lx + 62, ly, COLORS.C_WAIT, 'WAIT');
        drawStatusChip(p, lx + 132, ly, COLORS.C_IN_CS, 'IN_CS');
        drawStatusChip(p, lx + 214, ly, COLORS.C_ERROR, 'RACE');
        drawStatusChip(p, lx + 288, ly, COLORS.C_DEAD, 'DEAD');

        if (s.selectedCar) {
          drawPanel(p, W - 380, 10, 370, 60);
          drawLabel(p, `Seleccionado: Car ${s.selectedCar.id}`, W - 370, 18, 12, { r: 255, g: 255, b: 255 });
          drawLabel(p, `Estado: ${s.selectedCar.state}  |  Vel: ${s.selectedCar.speed.toFixed(1)}`, W - 370, 36, 10, { r: 200, g: 200, b: 200 });
          drawLabel(p, `Cross time: ${s.selectedCar.crossTime} frames`, W - 370, 50, 10, { r: 180, g: 180, b: 200 });
        }
      };

      const drawInstructions = () => {
        const data = INSTRUCTIONS[s.currentMode] || INSTRUCTIONS[0];
        const { bg, accent, lines, title, subtitle } = data;

        p.background(bg.r, bg.g, bg.b);

        p.noFill();
        for (let i = 0; i < 20; i++) {
          p.stroke(accent.r, accent.g, accent.b, 8 + (i % 3) * 2);
          p.strokeWeight(1);
          const rx = 100 + ((i * 173) % (W - 200));
          const ry = 80 + ((i * 97) % (H - 200));
          p.ellipse(rx, ry, 60 + i * 12, 60 + i * 12);
        }

        const px = 80, py = 50, pw = W - 160, ph = H - 100;
        p.fill(0, 0, 0, 160);
        p.noStroke();
        p.rect(px, py, pw, ph, 16);

        p.noFill();
        p.stroke(accent.r, accent.g, accent.b, 120);
        p.strokeWeight(2);
        p.rect(px, py, pw, ph, 16);

        p.noStroke();
        p.fill(accent.r, accent.g, accent.b, 40);
        p.rect(px, py, pw, 60, 16, 16, 0, 0);

        p.fill(accent.r, accent.g, accent.b);
        p.textAlign(p.LEFT, p.TOP);
        p.textSize(20);
        p.text(title, px + 30, py + 18);

        p.fill(200, 200, 220);
        p.textSize(12);
        p.text(subtitle, px + 30, py + 44);

        p.stroke(accent.r, accent.g, accent.b, 60);
        p.strokeWeight(1);
        p.line(px + 30, py + 65, px + pw - 30, py + 65);

        let ty = py + 82;
        for (const ln of lines) {
          if (ln === '') {
            ty += 8;
            continue;
          }
          if (ln === ln.toUpperCase() && ln.length > 3 && !ln.startsWith(' ') && !ln.startsWith('[')) {
            p.fill(accent.r, accent.g, accent.b);
            p.textSize(13);
          } else if (ln.trim().startsWith('[')) {
            p.fill(180, 200, 220);
            p.textSize(11);
          } else {
            p.fill(200, 200, 210);
            p.textSize(12);
          }
          p.textAlign(p.LEFT, p.TOP);
          p.text(ln, px + 35, ty);
          ty += 18;
        }

        const barY = H - 45;
        p.fill(0, 0, 0, 120);
        p.noStroke();
        p.rect(0, barY - 5, W, 50);

        const bw = 100;
        const totalW = 9 * bw + 8 * 8;
        const startX = (W - totalW) / 2;
        const labels = ['General', '1:Race', '2:Critica', '3:Mutex', '4:Sem', '5:Monitor', '6:Planif', '7:Dead', '8:Todo'];

        for (let i = 0; i < 9; i++) {
          const bx = startX + i * (bw + 8);
          const target = i;
          const isActive = s.currentMode === target || (target === 0 && s.currentMode === 0);
          if (isActive) {
            p.fill(accent.r, accent.g, accent.b, 80);
            p.stroke(accent.r, accent.g, accent.b, 200);
          } else {
            p.fill(40, 42, 50, 180);
            p.stroke(100, 100, 110, 80);
          }
          p.strokeWeight(1);
          p.rect(bx, barY, bw, 30, 5);
          p.fill(isActive ? 255 : 160);
          p.textAlign(p.CENTER, p.CENTER);
          p.textSize(10);
          p.text(labels[i], bx + bw / 2, barY + 15);
        }

        p.fill(accent.r, accent.g, accent.b, 180);
        p.textAlign(p.CENTER, p.TOP);
        p.textSize(11);
        p.text('[TAB] Cerrar y jugar   |   [1-8] Ver instrucciones', W / 2, py + ph + 8);
      };

      const getCurrentCars = (): Car[] => {
        switch (s.currentMode) {
          case 1: return s.m1Cars;
          case 2: return s.m2Cars;
          case 3: return s.m3Cars;
          case 4: return s.m4Cars;
          case 5: return s.m5Cars;
          case 6: return s.m6Cars;
          case 7: return s.m7Cars;
          case 8: return s.m8Cars;
          default: return [];
        }
      };

      p.setup = () => {
        p.createCanvas(W, H);
        p.textFont('monospace');
        m1Reset();
      };

      p.draw = () => {
        if (s.showInstructions) {
          drawInstructions();
        } else {
          switch (s.currentMode) {
            case 1: m1Step(); m1Draw(); break;
            case 2: m2Step(); m2Draw(); break;
            case 3: m3Step(); m3Draw(); break;
            case 4: m4Step(); m4Draw(); break;
            case 5: m5Step(); m5Draw(); break;
            case 6: m6Step(); m6Draw(); break;
            case 7: m7Step(); m7Draw(); break;
            case 8: m8Step(); m8Draw(); break;
          }
          drawGlobalHUD();
        }
      };

      p.mousePressed = () => {
        if (s.showInstructions) {
          const barY = H - 45;
          const bw = 100;
          const totalW = 9 * bw + 8 * 8;
          const startX = (W - totalW) / 2;
          for (let i = 0; i < 9; i++) {
            const bx = startX + i * (bw + 8);
            if (pointInRect(p.mouseX, p.mouseY, bx, barY, bw, 30)) {
              s.currentMode = i;
              return;
            }
          }
          return;
        }

        const cars = getCurrentCars();
        let clickedAny = false;
        for (const c of cars) {
          if (c.clicked(p.mouseX, p.mouseY)) {
            s.selectedCar = c;
            clickedAny = true;
            addEvent(`Seleccionado Car ${c.id}`);
            if (s.currentMode === 4 && c.state === 'PARKED') m4ForceExit(c);
            if (s.currentMode === 5 && c.state === 'PARKED') m5ForceExit(c);
            break;
          }
        }
        if (!clickedAny) s.selectedCar = null;
      };

      p.keyPressed = () => {
        if (p.key === 'Tab' || p.keyCode === 9) {
          s.showInstructions = !s.showInstructions;
          if (!s.showInstructions && s.currentMode === 0) {
            s.currentMode = 1;
            m1Reset();
          }
          return false;
        }

        if (s.showInstructions) {
          if (p.key >= '0' && p.key <= '8') {
            s.currentMode = parseInt(p.key);
          }
          return false;
        }

        // Mode change
        if (p.key >= '1' && p.key <= '8') {
          s.currentMode = parseInt(p.key);
          switch (s.currentMode) {
            case 1: m1Reset(); break;
            case 2: m2Reset(); break;
            case 3: m3Reset(); break;
            case 4: m4Reset(); break;
            case 5: m5Reset(); break;
            case 6: m6Reset(); break;
            case 7: m7Reset(); break;
            case 8: m8Reset(); break;
          }
          return false;
        }

        // Reset
        if (p.key === 'r' || p.key === 'R') {
          switch (s.currentMode) {
            case 1: m1Reset(); break;
            case 2: m2Reset(); break;
            case 3: m3Reset(); break;
            case 4: m4Reset(); break;
            case 5: m5Reset(); break;
            case 6: m6Reset(); break;
            case 7: m7Reset(); break;
            case 8: m8Reset(); break;
          }
          return false;
        }

        // Spawn
        if (p.key === ' ') {
          switch (s.currentMode) {
            case 1: m1Spawn(); break;
            case 2: m2Spawn(); break;
            case 3: m3Spawn(); break;
            case 4: m4Spawn(); break;
            case 5: m5Spawn(); break;
            case 6: m6Spawn(); break;
            case 7: m7SpawnPair(); break;
            case 8: m8Spawn(s.m8NextDest); break;
          }
          return false;
        }

        // Direction controls
        if (p.key === 'h' || p.key === 'H') {
          if (s.currentMode === 1) m1Spawn('H');
          if (s.currentMode === 2) m2Spawn('H');
          return false;
        }
        if (p.key === 'v' || p.key === 'V') {
          if (s.currentMode === 1) m1Spawn('V');
          if (s.currentMode === 2) m2Spawn('V');
          return false;
        }

        // Mode-specific controls
        if (p.key === 'k' || p.key === 'K') {
          if (s.currentMode === 4) {
            s.m4Cap = (s.m4Cap % 5) + 1;
            s.m4Sem = new SimSemaphore('Parqueo', s.m4Cap);
            addEvent(`Cupos cambiados a ${s.m4Cap}`);
          }
          return false;
        }

        if (p.key === 'p' || p.key === 'P') {
          if (s.currentMode === 6) {
            s.m6Policy = (s.m6Policy + 1) % 3;
            addEvent(`Politica: ${POLICY_NAMES[s.m6Policy]}`);
          } else if (s.currentMode === 8) {
            s.m8NextDest = 'pk';
            addEvent('Proximo destino: Parqueo');
          }
          return false;
        }

        if (p.key === 'e' || p.key === 'E') {
          if (s.currentMode === 7) {
            s.m7Prevent = !s.m7Prevent;
            addEvent(`Prevencion deadlock: ${s.m7Prevent ? 'ON' : 'OFF'}`);
          }
          return false;
        }

        if (p.key === 'f' || p.key === 'F') {
          if (s.currentMode === 7) {
            m7ForceResolve();
          }
          return false;
        }

        if (p.key === 'i' || p.key === 'I') {
          if (s.currentMode === 8) {
            s.m8NextDest = 'int';
            addEvent('Proximo destino: Interseccion');
          }
          return false;
        }

        if (p.key === 'b' || p.key === 'B') {
          if (s.currentMode === 8) {
            s.m8NextDest = 'br';
            addEvent('Proximo destino: Puente');
          }
          return false;
        }

        if (p.key === '0') {
          if (s.currentMode === 8) {
            s.m8NextDest = 'auto';
            addEvent('Proximo destino: Automatico');
          }
          return false;
        }

        return true;
      };
    };

    p5Ref.current = new p5(sketch, containerRef.current);

    return () => {
      p5Ref.current?.remove();
    };
  }, [addEvent, cleanCarFromAll, m1Reset, m1Spawn, m2Reset, m2Spawn, m3Reset, m3Spawn, m4ForceExit, m4Reset, m4Spawn, m5ForceExit, m5Reset, m5Spawn, m6Reset, m6Spawn, m7ForceResolve, m7Reset, m7SpawnPair, m8Reset, m8Spawn]);

  return (
    <div
      ref={containerRef}
      style={{
        width: W,
        height: H,
        margin: '0 auto',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}
    />
  );
}
