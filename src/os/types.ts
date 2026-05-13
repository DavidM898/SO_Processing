export type AppId =
  | 'terminal'
  | 'processmanager'
  | 'calculator'
  | 'filemanager'
  | 'game'
  | 'texteditor';

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

/** Bits estilo Unix (r=lectura, w=escritura, x=ejecución; en carpetas x = poder entrar). */
export interface FSAccessBits {
  read: boolean;
  write: boolean;
  execute: boolean;
}

/** Permisos del propietario vs el resto de usuarios (modelo didáctico simplificado). */
export interface FSPermissions {
  owner: FSAccessBits;
  others: FSAccessBits;
}

export interface FSNode {
  id: string;
  name: string;
  type: 'folder' | 'file';
  parentId: string | null;
  createdAt: number;
  /** Usuario dueño del nodo (simulado). */
  owner: string;
  permissions: FSPermissions;
  content?: string;
  sizeBytes?: number;
}

export const APP_DEFAULTS: Record<AppId, { w: number; h: number; title: string; processName: string }> = {
  terminal:       { w: 640,  h: 420,  title: 'Terminal — urlOS',             processName: 'Terminal.exe' },
  processmanager: { w: 700,  h: 500,  title: 'Administrador de Tareas',      processName: 'TaskMgr.exe' },
  calculator:     { w: 320,  h: 480,  title: 'Calculadora',                  processName: 'Calculadora.exe' },
  filemanager:    { w: 720,  h: 500,  title: 'Explorador de Archivos',       processName: 'Explorer.exe' },
  game:           { w: 880,  h: 660,  title: 'Simulador de Concurrencia',    processName: 'Simulador.exe' },
  texteditor:     { w: 640,  h: 500,  title: 'Bloc de notas',                processName: 'Notepad.exe' },
};

/** Icono y descripción corta para el menú Inicio y ayudas. */
export const APP_CATALOG: Record<AppId, { icon: string; description: string }> = {
  filemanager: {
    icon: '📁',
    description: 'Navegar el VFS, permisos y editor integrado en archivos',
  },
  game: {
    icon: '🚗',
    description: 'Simulador visual de concurrencia y sincronización',
  },
  terminal: {
    icon: '⬛',
    description: 'Comandos, usuarios y sistema de archivos por consola',
  },
  processmanager: {
    icon: '📊',
    description: 'Procesos simulados y uso de CPU',
  },
  calculator: {
    icon: '🔢',
    description: 'Calculadora básica',
  },
  texteditor: {
    icon: '📝',
    description: 'Editar y guardar archivos de texto en el directorio actual (cd en terminal)',
  },
};

/** Orden en el explorador de aplicaciones (menú urlOS). */
export const APP_MENU_ORDER: readonly AppId[] = [
  'filemanager',
  'game',
  'terminal',
  'processmanager',
  'calculator',
  'texteditor',
] as const;
