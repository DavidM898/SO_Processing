import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import type { FSNode } from '../types';
import {
  DEFAULT_FS_USERS,
  ROOT_ID,
  buildPath,
  canEnterDir,
  canModifyDirEntries,
  canReadNode,
  canWriteNode,
  collectDescendants,
  createInitialNodes,
  findChildByName,
  getEffectiveBits,
  makeFile,
  makeFolder,
  normalizeUsername,
  permissionsFromOctal,
  resolveAccountName,
  sortKnownUsers,
  validateNewUsername,
} from '../fs/fsModel';

type FSResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

interface FSState {
  nodes: Record<string, FSNode>;
  currentUser: string;
  terminalCwdId: string;
  /** Cuentas del sistema simulado (solo root puede ampliar o reducir vía addUser/removeUser). */
  users: string[];
}

type FSAction =
  | { type: 'CREATE_FOLDER'; id: string; parentId: string; name: string; owner: string }
  | { type: 'CREATE_FILE'; id: string; parentId: string; name: string; owner: string; content: string }
  | { type: 'DELETE'; id: string }
  | { type: 'RENAME'; id: string; name: string }
  | { type: 'WRITE_FILE'; id: string; content: string }
  | { type: 'CHMOD'; id: string; permissions: import('../types').FSPermissions }
  | { type: 'CHOWN'; id: string; owner: string }
  | { type: 'SET_USER'; user: string }
  | { type: 'SET_TERMINAL_CWD'; id: string }
  | { type: 'ADD_USER'; name: string }
  | { type: 'REMOVE_USER'; name: string };

function fsReducer(state: FSState, action: FSAction): FSState {
  switch (action.type) {
    case 'CREATE_FOLDER': {
      const node = makeFolder(action.id, action.name, action.parentId, action.owner);
      return { ...state, nodes: { ...state.nodes, [action.id]: node } };
    }
    case 'CREATE_FILE': {
      const node = makeFile(action.id, action.name, action.parentId, action.owner, action.content);
      return { ...state, nodes: { ...state.nodes, [action.id]: node } };
    }
    case 'DELETE': {
      const toDelete = collectDescendants(state.nodes, action.id);
      const next = { ...state.nodes };
      for (const id of toDelete) delete next[id];
      let terminalCwdId = state.terminalCwdId;
      if (toDelete.includes(terminalCwdId)) {
        terminalCwdId = ROOT_ID;
      }
      return { ...state, nodes: next, terminalCwdId };
    }
    case 'RENAME': {
      const n = state.nodes[action.id];
      if (!n) return state;
      return {
        ...state,
        nodes: { ...state.nodes, [action.id]: { ...n, name: action.name } },
      };
    }
    case 'WRITE_FILE': {
      const n = state.nodes[action.id];
      if (!n || n.type !== 'file') return state;
      const enc = new TextEncoder().encode(action.content);
      return {
        ...state,
        nodes: {
          ...state.nodes,
          [action.id]: { ...n, content: action.content, sizeBytes: enc.byteLength },
        },
      };
    }
    case 'CHMOD': {
      const n = state.nodes[action.id];
      if (!n) return state;
      return {
        ...state,
        nodes: { ...state.nodes, [action.id]: { ...n, permissions: action.permissions } },
      };
    }
    case 'CHOWN': {
      const n = state.nodes[action.id];
      if (!n) return state;
      return { ...state, nodes: { ...state.nodes, [action.id]: { ...n, owner: action.owner } } };
    }
    case 'SET_USER':
      return { ...state, currentUser: action.user };
    case 'SET_TERMINAL_CWD':
      return { ...state, terminalCwdId: action.id };
    case 'ADD_USER':
      return { ...state, users: [...state.users, action.name] };
    case 'REMOVE_USER':
      return { ...state, users: state.users.filter(x => x.toLowerCase() !== action.name.toLowerCase()) };
    default:
      return state;
  }
}

const INITIAL_FS_STATE: FSState = {
  nodes: createInitialNodes(),
  currentUser: 'ana',
  terminalCwdId: ROOT_ID,
  users: [...DEFAULT_FS_USERS],
};

function canChmod(
  nodes: Record<string, FSNode>,
  user: string,
  nodeId: string,
): boolean {
  if (user === 'root') return true;
  const n = nodes[nodeId];
  if (!n) return false;
  return n.owner === user;
}

export interface FileSystemContextValue {
  nodes: Record<string, FSNode>;
  currentUser: string;
  knownUsers: readonly string[];
  terminalCwdId: string;
  pathOf: (id: string) => string;
  switchUser: (user: string) => FSResult;
  setTerminalCwd: (id: string) => void;
  canReadNode: (id: string) => boolean;
  canWriteNode: (id: string) => boolean;
  canEnterDir: (id: string) => boolean;
  canModifyDirEntries: (dirId: string) => boolean;
  effectiveBits: (id: string) => import('../types').FSAccessBits | null;
  createFolder: (parentId: string, name: string) => FSResult<string>;
  createFile: (parentId: string, name: string, content?: string) => FSResult<string>;
  deleteNode: (id: string) => FSResult;
  renameNode: (id: string, name: string) => FSResult;
  readFileContent: (id: string) => FSResult<string>;
  writeFileContent: (id: string, content: string) => FSResult;
  chmodNode: (id: string, octal: string) => FSResult;
  chownNode: (id: string, newOwner: string) => FSResult;
  addUser: (rawName: string) => FSResult;
  removeUser: (rawName: string) => FSResult;
  getNode: (id: string) => FSNode | undefined;
  findChild: (parentId: string, name: string) => FSNode | undefined;
}

const FileSystemContext = createContext<FileSystemContextValue | null>(null);

export function FileSystemProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(fsReducer, INITIAL_FS_STATE);

  const pathOf = useCallback((id: string) => buildPath(state.nodes, id), [state.nodes]);

  const switchUser = useCallback(
    (user: string): FSResult => {
      const resolved = resolveAccountName(state.users, user);
      if (!resolved) {
        return {
          ok: false,
          error: `Usuario desconocido. Cuentas: ${sortKnownUsers(state.users).join(', ')}`,
        };
      }
      dispatch({ type: 'SET_USER', user: resolved });
      return { ok: true };
    },
    [state.users],
  );

  const setTerminalCwd = useCallback((id: string) => {
    dispatch({ type: 'SET_TERMINAL_CWD', id });
  }, []);

  const canReadNodeCb = useCallback(
    (id: string) => canReadNode(state.nodes, state.currentUser, id),
    [state.nodes, state.currentUser],
  );
  const canWriteNodeCb = useCallback(
    (id: string) => canWriteNode(state.nodes, state.currentUser, id),
    [state.nodes, state.currentUser],
  );
  const canEnterDirCb = useCallback(
    (id: string) => canEnterDir(state.nodes, state.currentUser, id),
    [state.nodes, state.currentUser],
  );
  const canModifyDirEntriesCb = useCallback(
    (dirId: string) => canModifyDirEntries(state.nodes, state.currentUser, dirId),
    [state.nodes, state.currentUser],
  );

  const effectiveBits = useCallback(
    (id: string) => {
      const n = state.nodes[id];
      if (!n) return null;
      return getEffectiveBits(n, state.currentUser);
    },
    [state.nodes, state.currentUser],
  );

  const getNode = useCallback((id: string) => state.nodes[id], [state.nodes]);
  const findChild = useCallback(
    (parentId: string, name: string) => findChildByName(state.nodes, parentId, name),
    [state.nodes],
  );

  const createFolder = useCallback(
    (parentId: string, name: string): FSResult<string> => {
      const trimmed = name.trim();
      if (!trimmed) return { ok: false, error: 'El nombre no puede estar vacío.' };
      const parent = state.nodes[parentId];
      if (!parent || parent.type !== 'folder') return { ok: false, error: 'Directorio padre no válido.' };
      if (!canModifyDirEntries(state.nodes, state.currentUser, parentId)) {
        return { ok: false, error: 'Permiso denegado: no puede crear entradas en este directorio.' };
      }
      if (findChildByName(state.nodes, parentId, trimmed)) {
        return { ok: false, error: `Ya existe «${trimmed}» en este directorio.` };
      }
      const id = crypto.randomUUID();
      dispatch({
        type: 'CREATE_FOLDER',
        id,
        parentId,
        name: trimmed,
        owner: state.currentUser,
      });
      return { ok: true, data: id };
    },
    [state.nodes, state.currentUser],
  );

  const createFile = useCallback(
    (parentId: string, name: string, content = ''): FSResult<string> => {
      const trimmed = name.trim();
      if (!trimmed) return { ok: false, error: 'El nombre no puede estar vacío.' };
      const parent = state.nodes[parentId];
      if (!parent || parent.type !== 'folder') return { ok: false, error: 'Directorio padre no válido.' };
      if (!canModifyDirEntries(state.nodes, state.currentUser, parentId)) {
        return { ok: false, error: 'Permiso denegado: no puede crear archivos aquí.' };
      }
      if (findChildByName(state.nodes, parentId, trimmed)) {
        return { ok: false, error: `Ya existe «${trimmed}» en este directorio.` };
      }
      const id = crypto.randomUUID();
      dispatch({
        type: 'CREATE_FILE',
        id,
        parentId,
        name: trimmed,
        owner: state.currentUser,
        content,
      });
      return { ok: true, data: id };
    },
    [state.nodes, state.currentUser],
  );

  const deleteNode = useCallback(
    (id: string): FSResult => {
      if (id === ROOT_ID) return { ok: false, error: 'No se puede eliminar la raíz del sistema de archivos.' };
      const node = state.nodes[id];
      if (!node) return { ok: false, error: 'No existe el elemento.' };
      const parentId = node.parentId;
      if (!parentId) return { ok: false, error: 'No se puede eliminar este elemento.' };
      if (!canModifyDirEntries(state.nodes, state.currentUser, parentId)) {
        return { ok: false, error: 'Permiso denegado: no puede borrar en este directorio.' };
      }
      dispatch({ type: 'DELETE', id });
      return { ok: true };
    },
    [state.nodes, state.currentUser],
  );

  const renameNode = useCallback(
    (id: string, name: string): FSResult => {
      const trimmed = name.trim();
      if (!trimmed) return { ok: false, error: 'El nombre no puede estar vacío.' };
      const node = state.nodes[id];
      if (!node || id === ROOT_ID) return { ok: false, error: 'No se puede renombrar.' };
      const parentId = node.parentId;
      if (!parentId) return { ok: false, error: 'Permiso denegado.' };
      if (!canModifyDirEntries(state.nodes, state.currentUser, parentId)) {
        return { ok: false, error: 'Permiso denegado: no puede renombrar en este directorio.' };
      }
      if (findChildByName(state.nodes, parentId, trimmed) && findChildByName(state.nodes, parentId, trimmed)?.id !== id) {
        return { ok: false, error: `Ya existe «${trimmed}» en este directorio.` };
      }
      dispatch({ type: 'RENAME', id, name: trimmed });
      return { ok: true };
    },
    [state.nodes, state.currentUser],
  );

  const readFileContent = useCallback(
    (id: string): FSResult<string> => {
      const node = state.nodes[id];
      if (!node || node.type !== 'file') return { ok: false, error: 'No es un archivo válido.' };
      if (!canReadNode(state.nodes, state.currentUser, id)) {
        return { ok: false, error: 'Permiso denegado: lectura no permitida.' };
      }
      return { ok: true, data: node.content ?? '' };
    },
    [state.nodes, state.currentUser],
  );

  const writeFileContent = useCallback(
    (id: string, content: string): FSResult => {
      const node = state.nodes[id];
      if (!node || node.type !== 'file') return { ok: false, error: 'No es un archivo válido.' };
      if (!canWriteNode(state.nodes, state.currentUser, id)) {
        return { ok: false, error: 'Permiso denegado: escritura no permitida.' };
      }
      dispatch({ type: 'WRITE_FILE', id, content });
      return { ok: true };
    },
    [state.nodes, state.currentUser],
  );

  const chmodNode = useCallback(
    (id: string, octal: string): FSResult => {
      const node = state.nodes[id];
      if (!node) return { ok: false, error: 'No existe el elemento.' };
      if (!canChmod(state.nodes, state.currentUser, id)) {
        return { ok: false, error: 'Permiso denegado: solo el propietario o root pueden cambiar el modo.' };
      }
      const perms = permissionsFromOctal(octal.trim());
      if (!perms) return { ok: false, error: 'Modo inválido. Use tres dígitos octales (ej. 644, 755).' };
      dispatch({ type: 'CHMOD', id, permissions: perms });
      return { ok: true };
    },
    [state.nodes, state.currentUser],
  );

  const chownNode = useCallback(
    (id: string, newOwner: string): FSResult => {
      if (state.currentUser !== 'root') {
        return { ok: false, error: 'Solo root puede ejecutar chown.' };
      }
      const canonical = resolveAccountName(state.users, newOwner);
      if (!canonical) {
        return {
          ok: false,
          error: `Usuario destino inexistente. Cuentas: ${sortKnownUsers(state.users).join(', ')}`,
        };
      }
      const node = state.nodes[id];
      if (!node || id === ROOT_ID) return { ok: false, error: 'No se puede cambiar el propietario.' };
      dispatch({ type: 'CHOWN', id, owner: canonical });
      return { ok: true };
    },
    [state.nodes, state.currentUser, state.users],
  );

  const addUser = useCallback(
    (rawName: string): FSResult => {
      if (state.currentUser !== 'root') {
        return { ok: false, error: 'Solo root puede crear usuarios (comando useradd).' };
      }
      const err = validateNewUsername(rawName, state.users);
      if (err) return { ok: false, error: err };
      const name = normalizeUsername(rawName);
      dispatch({ type: 'ADD_USER', name });
      return { ok: true };
    },
    [state.currentUser, state.users],
  );

  const removeUser = useCallback(
    (rawName: string): FSResult => {
      if (state.currentUser !== 'root') {
        return { ok: false, error: 'Solo root puede eliminar usuarios (comando userdel).' };
      }
      const target = normalizeUsername(rawName);
      if (target === 'root') {
        return { ok: false, error: 'No se puede eliminar la cuenta root.' };
      }
      if (target === state.currentUser.toLowerCase()) {
        return { ok: false, error: 'No puede eliminar la cuenta con la que tiene la sesión iniciada.' };
      }
      const canonical = resolveAccountName(state.users, rawName);
      if (!canonical) {
        return { ok: false, error: `No existe la cuenta «${target}».` };
      }
      const owned = Object.values(state.nodes).some(n => n.owner.toLowerCase() === canonical.toLowerCase());
      if (owned) {
        return {
          ok: false,
          error:
            'No se puede eliminar: aún hay archivos o carpetas de propiedad de este usuario. Reasigne con chown o borre esos nodos primero.',
        };
      }
      dispatch({ type: 'REMOVE_USER', name: canonical });
      return { ok: true };
    },
    [state.currentUser, state.users, state.nodes],
  );

  const value = useMemo<FileSystemContextValue>(
    () => ({
      nodes: state.nodes,
      currentUser: state.currentUser,
      knownUsers: sortKnownUsers(state.users),
      terminalCwdId: state.terminalCwdId,
      pathOf,
      switchUser,
      setTerminalCwd,
      canReadNode: canReadNodeCb,
      canWriteNode: canWriteNodeCb,
      canEnterDir: canEnterDirCb,
      canModifyDirEntries: canModifyDirEntriesCb,
      effectiveBits,
      createFolder,
      createFile,
      deleteNode,
      renameNode,
      readFileContent,
      writeFileContent,
      chmodNode,
      chownNode,
      addUser,
      removeUser,
      getNode,
      findChild,
    }),
    [
      state.nodes,
      state.currentUser,
      state.users,
      state.terminalCwdId,
      pathOf,
      switchUser,
      setTerminalCwd,
      canReadNodeCb,
      canWriteNodeCb,
      canEnterDirCb,
      canModifyDirEntriesCb,
      effectiveBits,
      createFolder,
      createFile,
      deleteNode,
      renameNode,
      readFileContent,
      writeFileContent,
      chmodNode,
      chownNode,
      addUser,
      removeUser,
      getNode,
      findChild,
    ],
  );

  return <FileSystemContext.Provider value={value}>{children}</FileSystemContext.Provider>;
}

/* eslint-disable react-refresh/only-export-components -- módulo de contexto: Provider + hook */
export function useFileSystem(): FileSystemContextValue {
  const ctx = useContext(FileSystemContext);
  if (!ctx) throw new Error('useFileSystem debe usarse dentro de FileSystemProvider');
  return ctx;
}
