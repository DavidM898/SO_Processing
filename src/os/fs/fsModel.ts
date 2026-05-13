import type { FSAccessBits, FSNode, FSPermissions } from '../types';

export const ROOT_ID = 'root';

/** Cuentas iniciales del VFS (semilla del estado `users` en FileSystemContext). */
export const DEFAULT_FS_USERS = ['root', 'ana', 'invitado'] as const;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Devuelve mensaje de error o `null` si el nombre es válido y no está duplicado. */
export function validateNewUsername(raw: string, existing: readonly string[]): string | null {
  const n = normalizeUsername(raw);
  if (n.length < 2 || n.length > 32) {
    return 'El usuario debe tener entre 2 y 32 caracteres.';
  }
  if (!/^[a-z0-9_]+$/.test(n)) {
    return 'Solo letras minúsculas, dígitos y guión bajo (_).';
  }
  if (existing.some(e => e.toLowerCase() === n)) {
    return 'Ese nombre de usuario ya existe.';
  }
  return null;
}

export function resolveAccountName(users: readonly string[], raw: string): string | null {
  const u = normalizeUsername(raw);
  return users.find(x => x.toLowerCase() === u) ?? null;
}

/** `root` primero, resto alfabético (para listados y UI). */
export function sortKnownUsers(users: readonly string[]): string[] {
  return [...users].sort((a, b) => {
    if (a === 'root') return -1;
    if (b === 'root') return 1;
    return a.localeCompare(b);
  });
}

export function defaultDirPermissions(): FSPermissions {
  return {
    owner: { read: true, write: true, execute: true },
    others: { read: true, write: false, execute: true },
  };
}

export function defaultFilePermissions(): FSPermissions {
  return {
    owner: { read: true, write: true, execute: false },
    others: { read: true, write: false, execute: false },
  };
}

export function privateFilePermissions(): FSPermissions {
  return {
    owner: { read: true, write: true, execute: false },
    others: { read: false, write: false, execute: false },
  };
}

function octalDigitToBits(d: number): FSAccessBits {
  return {
    read: (d & 4) !== 0,
    write: (d & 2) !== 0,
    execute: (d & 1) !== 0,
  };
}

/** Interpreta modo tipo Unix (ugo): propietario = u, "otros" = OR de g y o (modelo simplificado a 2 clases). */
export function permissionsFromOctal(mode: string): FSPermissions | null {
  if (!/^[0-7]{3}$/.test(mode)) return null;
  const u = parseInt(mode[0], 10);
  const g = parseInt(mode[1], 10);
  const o = parseInt(mode[2], 10);
  const owner = octalDigitToBits(u);
  const G = octalDigitToBits(g);
  const O = octalDigitToBits(o);
  return {
    owner,
    others: {
      read: G.read || O.read,
      write: G.write || O.write,
      execute: G.execute || O.execute,
    },
  };
}

export function formatPermissionLetters(p: FSPermissions): string {
  const b = (x: FSAccessBits) => `${x.read ? 'r' : '-'}${x.write ? 'w' : '-'}${x.execute ? 'x' : '-'}`;
  return `${b(p.owner)} ${b(p.others)}`;
}

export function getEffectiveBits(node: FSNode, user: string): FSAccessBits {
  if (user === 'root') {
    return { read: true, write: true, execute: true };
  }
  return user === node.owner ? node.permissions.owner : node.permissions.others;
}

export function canReadNode(nodes: Record<string, FSNode>, user: string, id: string): boolean {
  const n = nodes[id];
  if (!n) return false;
  return getEffectiveBits(n, user).read;
}

export function canWriteNode(nodes: Record<string, FSNode>, user: string, id: string): boolean {
  const n = nodes[id];
  if (!n) return false;
  return getEffectiveBits(n, user).write;
}

/** Para carpetas: permiso de ejecución = atravesar / entrar. */
export function canEnterDir(nodes: Record<string, FSNode>, user: string, dirId: string): boolean {
  const n = nodes[dirId];
  if (!n || n.type !== 'folder') return false;
  return getEffectiveBits(n, user).execute;
}

/** Crear / borrar / renombrar enlace en el padre requiere escritura en el directorio. */
export function canModifyDirEntries(nodes: Record<string, FSNode>, user: string, dirId: string): boolean {
  return canWriteNode(nodes, user, dirId) && canEnterDir(nodes, user, dirId);
}

export function findChildByName(
  nodes: Record<string, FSNode>,
  parentId: string,
  name: string,
): FSNode | undefined {
  const lower = name.toLowerCase();
  return Object.values(nodes).find(
    n => n.parentId === parentId && n.name.toLowerCase() === lower,
  );
}

export function buildPath(nodes: Record<string, FSNode>, id: string): string {
  const parts: string[] = [];
  let cur: FSNode | undefined = nodes[id];
  while (cur) {
    if (cur.id !== ROOT_ID) parts.unshift(cur.name);
    cur = cur.parentId ? nodes[cur.parentId] : undefined;
  }
  return '/' + parts.join('/');
}

export function makeFolder(
  id: string,
  name: string,
  parentId: string | null,
  owner: string,
  permissions?: FSPermissions,
): FSNode {
  return {
    id,
    name,
    type: 'folder',
    parentId,
    createdAt: Date.now(),
    owner,
    permissions: permissions ?? defaultDirPermissions(),
  };
}

export function makeFile(
  id: string,
  name: string,
  parentId: string,
  owner: string,
  content: string,
  permissions?: FSPermissions,
): FSNode {
  const enc = new TextEncoder().encode(content);
  return {
    id,
    name,
    type: 'file',
    parentId,
    createdAt: Date.now(),
    owner,
    permissions: permissions ?? defaultFilePermissions(),
    content,
    sizeBytes: enc.byteLength,
  };
}

export function collectDescendants(nodes: Record<string, FSNode>, id: string): string[] {
  const result = [id];
  for (const node of Object.values(nodes)) {
    if (node.parentId === id) {
      result.push(...collectDescendants(nodes, node.id));
    }
  }
  return result;
}

export function createInitialNodes(): Record<string, FSNode> {
  return {
    [ROOT_ID]: makeFolder(ROOT_ID, 'Este Equipo', null, 'root', {
      owner: { read: true, write: true, execute: true },
      others: { read: true, write: false, execute: true },
    }),
    docs: makeFolder('docs', 'Documentos', ROOT_ID, 'ana'),
    imgs: makeFolder('imgs', 'Imágenes', ROOT_ID, 'ana'),
    down: makeFolder('down', 'Descargas', ROOT_ID, 'ana'),
    readme: makeFile('readme', 'leeme.txt', 'docs', 'ana', 'Bienvenido a urlOS', defaultFilePermissions()),
    secreto: makeFile(
      'secreto',
      'secreto_ana.txt',
      'docs',
      'ana',
      'Solo Ana (o root) puede leer esto.',
      privateFilePermissions(),
    ),
    publico: makeFile(
      'publico',
      'leeme_invitado.txt',
      'docs',
      'invitado',
      'Archivo del usuario invitado.',
      defaultFilePermissions(),
    ),
  };
}
