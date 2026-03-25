export type AppId =
  | 'terminal'
  | 'processmanager'
  | 'calculator'
  | 'filemanager'
  | 'game';

export interface WindowDef {
  id: string;
  appId: AppId;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  minimized: boolean;
  maximized: boolean;
  prevBounds?: { x: number; y: number; width: number; height: number };
  pid: number;
}

export interface WindowState {
  windows: WindowDef[];
  topZ: number;
}

export type WindowAction =
  | { type: 'OPEN'; appId: AppId; title: string; defaultSize: { w: number; h: number }; pid: number }
  | { type: 'CLOSE'; id: string }
  | { type: 'MINIMIZE'; id: string }
  | { type: 'RESTORE'; id: string }
  | { type: 'MAXIMIZE'; id: string }
  | { type: 'FOCUS'; id: string }
  | { type: 'MOVE'; id: string; x: number; y: number };

export interface OSProcess {
  pid: number;
  name: string;
  type: 'system' | 'app';
  appId?: AppId;
  cpuPercent: number;
  memoryMB: number;
  startedAt: number;
}

export interface ProcessState {
  processes: OSProcess[];
  cpuHistory: number[];
  nextPid: number;
}

export type ProcessAction =
  | { type: 'REGISTER'; process: Omit<OSProcess, 'pid'> }
  | { type: 'UNREGISTER'; pid: number }
  | { type: 'TICK' };

export interface FSNode {
  id: string;
  name: string;
  type: 'folder' | 'file';
  parentId: string | null;
  createdAt: number;
  content?: string;
  sizeBytes?: number;
}

export const APP_DEFAULTS: Record<AppId, { w: number; h: number; title: string; processName: string }> = {
  terminal:       { w: 640,  h: 420,  title: 'Terminal — urlOS',             processName: 'Terminal.exe' },
  processmanager: { w: 700,  h: 500,  title: 'Administrador de Tareas',      processName: 'TaskMgr.exe' },
  calculator:     { w: 320,  h: 480,  title: 'Calculadora',                  processName: 'Calculadora.exe' },
  filemanager:    { w: 720,  h: 500,  title: 'Explorador de Archivos',       processName: 'Explorer.exe' },
  game:           { w: 880,  h: 660,  title: 'Simulador de Concurrencia',    processName: 'Simulador.exe' },
};
