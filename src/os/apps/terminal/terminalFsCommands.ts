import type { FSNode } from '../../types';
import type { FileSystemContextValue } from '../../context/FileSystemContext';
import { ROOT_ID, buildPath, formatPermissionLetters, normalizeUsername, resolveAccountName } from '../../fs/fsModel';

export type FsCommandOutcome =
  | { kind: 'lines'; lines: string[] }
  | { kind: 'error'; message: string };

function resolveInCwd(fs: FileSystemContextValue, name: string): FSNode | undefined {
  return fs.findChild(fs.terminalCwdId, name.trim());
}

/** echo texto > archivo.txt (sobrescribe). */
function parseEchoRedirect(line: string): { payload: string; file: string } | null {
  const m = /^\s*echo\s+(.+?)\s*>\s*(\S+)\s*$/i.exec(line);
  if (!m) return null;
  return { payload: m[1].trim(), file: m[2].trim() };
}

export function tryHandleFilesystemCommand(
  raw: string,
  fs: FileSystemContextValue,
): FsCommandOutcome | null {
  const line = raw.trim();
  if (!line) return null;

  const low = line.toLowerCase();

  if (low === 'whoami') {
    return { kind: 'lines', lines: [fs.currentUser] };
  }

  if (low === 'users' || low === 'cuentas') {
    const list = fs.knownUsers;
    if (list.length === 0) return { kind: 'lines', lines: ['(sin cuentas)'] };
    return { kind: 'lines', lines: ['Cuentas del sistema:', ...list.map(u => `  ${u}`)] };
  }

  if (low.startsWith('useradd ')) {
    const name = line.slice(8).trim();
    if (!name) return { kind: 'error', message: 'Uso: useradd <nombre>' };
    const r = fs.addUser(name);
    if (!r.ok) return { kind: 'error', message: r.error };
    const n = normalizeUsername(name);
    return { kind: 'lines', lines: [`Usuario «${n}» creado. Use su ${n} para iniciar sesión.`] };
  }

  if (low.startsWith('userdel ')) {
    const name = line.slice(8).trim();
    if (!name) return { kind: 'error', message: 'Uso: userdel <nombre>' };
    const r = fs.removeUser(name);
    if (!r.ok) return { kind: 'error', message: r.error };
    return { kind: 'lines', lines: [`Cuenta «${normalizeUsername(name)}» eliminada.`] };
  }

  if (low.startsWith('su ')) {
    const user = line.slice(3).trim();
    const r = fs.switchUser(user);
    if (!r.ok) return { kind: 'error', message: r.error };
    const canonical = resolveAccountName(fs.knownUsers, user) ?? user.trim();
    return { kind: 'lines', lines: [`Sesión cambiada a «${canonical}».`] };
  }

  if (low === 'pwd') {
    return { kind: 'lines', lines: [buildPath(fs.nodes, fs.terminalCwdId)] };
  }

  if (low === 'ls' || low === 'dir') {
    const kids = Object.values(fs.nodes).filter(n => n.parentId === fs.terminalCwdId);
    if (!fs.canReadNode(fs.terminalCwdId)) {
      return { kind: 'error', message: 'Permiso denegado: no puede listar este directorio.' };
    }
    if (kids.length === 0) return { kind: 'lines', lines: ['(vacío)'] };
    const lines = kids.map(n => {
      const t = n.type === 'folder' ? 'd' : '-';
      const p = formatPermissionLetters(n.permissions);
      const sz = n.type === 'file' ? String(n.sizeBytes ?? 0) : '-';
      return `${t} ${p}  ${n.owner.padEnd(10)} ${sz.padStart(6)}  ${n.name}`;
    });
    return { kind: 'lines', lines };
  }

  if (low === 'cd ..') {
    const cur = fs.nodes[fs.terminalCwdId];
    if (!cur?.parentId) return { kind: 'error', message: 'Ya está en la raíz.' };
    if (!fs.canEnterDir(cur.parentId)) {
      return { kind: 'error', message: 'Permiso denegado: no puede subir a ese directorio.' };
    }
    fs.setTerminalCwd(cur.parentId);
    return { kind: 'lines', lines: [buildPath(fs.nodes, cur.parentId)] };
  }

  if (low === 'cd' || low === 'cd .') {
    return { kind: 'lines', lines: [buildPath(fs.nodes, fs.terminalCwdId)] };
  }

  if (low.startsWith('cd ')) {
    const name = line.slice(3).trim();
    if (name === '/' || name === '\\') {
      if (!fs.canEnterDir(ROOT_ID)) return { kind: 'error', message: 'Permiso denegado en /.' };
      fs.setTerminalCwd(ROOT_ID);
      return { kind: 'lines', lines: [buildPath(fs.nodes, ROOT_ID)] };
    }
    const target = resolveInCwd(fs, name);
    if (!target) return { kind: 'error', message: `No existe «${name}» en el directorio actual.` };
    if (target.type !== 'folder') return { kind: 'error', message: `«${name}» no es una carpeta.` };
    if (!fs.canEnterDir(target.id)) {
      return { kind: 'error', message: 'Permiso denegado: no puede entrar a esa carpeta.' };
    }
    fs.setTerminalCwd(target.id);
    return { kind: 'lines', lines: [buildPath(fs.nodes, target.id)] };
  }

  if (low.startsWith('mkdir ')) {
    const name = line.slice(6).trim();
    const r = fs.createFolder(fs.terminalCwdId, name);
    if (!r.ok) return { kind: 'error', message: r.error };
    return { kind: 'lines', lines: [`Carpeta «${name.trim()}» creada.`] };
  }

  if (low.startsWith('touch ')) {
    const name = line.slice(6).trim();
    const r = fs.createFile(fs.terminalCwdId, name, '');
    if (!r.ok) return { kind: 'error', message: r.error };
    return { kind: 'lines', lines: [`Archivo «${name.trim()}» creado.`] };
  }

  if (low.startsWith('cat ')) {
    const name = line.slice(4).trim();
    const n = resolveInCwd(fs, name);
    if (!n) return { kind: 'error', message: `No existe «${name}».` };
    if (n.type !== 'file') return { kind: 'error', message: `«${name}» no es un archivo.` };
    const r = fs.readFileContent(n.id);
    if (!r.ok) return { kind: 'error', message: r.error };
    return { kind: 'lines', lines: [r.data ?? ''] };
  }

  const echoRedir = parseEchoRedirect(line);
  if (echoRedir) {
    const n = resolveInCwd(fs, echoRedir.file);
    if (n) {
      const w = fs.writeFileContent(n.id, echoRedir.payload);
      if (!w.ok) return { kind: 'error', message: w.error };
      return { kind: 'lines', lines: [`Escrito en «${echoRedir.file}».`] };
    }
    const c = fs.createFile(fs.terminalCwdId, echoRedir.file, echoRedir.payload);
    if (!c.ok) return { kind: 'error', message: c.error };
    return { kind: 'lines', lines: [`Creado y escrito «${echoRedir.file}».`] };
  }

  if (low.startsWith('rm ')) {
    const name = line.slice(3).trim();
    const n = resolveInCwd(fs, name);
    if (!n) return { kind: 'error', message: `No existe «${name}».` };
    if (n.type === 'folder') {
      const kids = Object.values(fs.nodes).some(c => c.parentId === n.id);
      if (kids) return { kind: 'error', message: 'La carpeta no está vacía (use el Explorador para borrar en árbol).' };
    }
    const r = fs.deleteNode(n.id);
    if (!r.ok) return { kind: 'error', message: r.error };
    return { kind: 'lines', lines: [`Eliminado «${name}».`] };
  }

  if (low.startsWith('chmod ')) {
    const rest = line.slice(6).trim();
    const sp = rest.split(/\s+/);
    if (sp.length < 2) return { kind: 'error', message: 'Uso: chmod <octal> <nombre>' };
    const mode = sp[0];
    const name = sp.slice(1).join(' ');
    const n = resolveInCwd(fs, name);
    if (!n) return { kind: 'error', message: `No existe «${name}».` };
    const r = fs.chmodNode(n.id, mode);
    if (!r.ok) return { kind: 'error', message: r.error };
    return { kind: 'lines', lines: [`chmod ${mode} ${n.name}`] };
  }

  if (low.startsWith('chown ')) {
    const rest = line.slice(6).trim();
    const sp = rest.split(/\s+/);
    if (sp.length < 2) return { kind: 'error', message: 'Uso: chown <usuario> <nombre>' };
    const newOwner = sp[0];
    const name = sp.slice(1).join(' ');
    const n = resolveInCwd(fs, name);
    if (!n) return { kind: 'error', message: `No existe «${name}».` };
    const r = fs.chownNode(n.id, newOwner);
    if (!r.ok) return { kind: 'error', message: r.error };
    return { kind: 'lines', lines: [`chown ${newOwner} ${n.name}`] };
  }

  return null;
}
