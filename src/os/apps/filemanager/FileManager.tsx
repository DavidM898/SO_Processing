import { useReducer, useState, useRef, useEffect } from 'react';
import type { FSNode } from '../../types';
import { useFileSystem } from '../../context/FileSystemContext';
import { ROOT_ID, formatPermissionLetters } from '../../fs/fsModel';
import './FileManager.css';

interface NavState {
  currentDirId: string;
  selectedId: string | null;
  navHistory: string[];
  navIndex: number;
  renaming: string | null;
}

type NavAction =
  | { type: 'NAVIGATE'; dirId: string }
  | { type: 'NAV_BACK' }
  | { type: 'NAV_FORWARD' }
  | { type: 'NAV_UP'; nodes: Record<string, FSNode> }
  | { type: 'SELECT'; id: string | null }
  | { type: 'RENAME_START'; id: string }
  | { type: 'RENAME_CANCEL' }
  | { type: 'SYNC_DIR'; dirId: string };

function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case 'NAVIGATE': {
      const hist = state.navHistory.slice(0, state.navIndex + 1);
      return {
        ...state,
        currentDirId: action.dirId,
        selectedId: null,
        renaming: null,
        navHistory: [...hist, action.dirId],
        navIndex: hist.length,
      };
    }
    case 'NAV_BACK': {
      if (state.navIndex <= 0) return state;
      const ni = state.navIndex - 1;
      return { ...state, currentDirId: state.navHistory[ni], navIndex: ni, selectedId: null, renaming: null };
    }
    case 'NAV_FORWARD': {
      if (state.navIndex >= state.navHistory.length - 1) return state;
      const ni = state.navIndex + 1;
      return { ...state, currentDirId: state.navHistory[ni], navIndex: ni, selectedId: null, renaming: null };
    }
    case 'NAV_UP': {
      const cur = action.nodes[state.currentDirId];
      if (!cur || cur.parentId === null) return state;
      return navReducer(state, { type: 'NAVIGATE', dirId: cur.parentId });
    }
    case 'SELECT':
      return { ...state, selectedId: action.id, renaming: null };
    case 'RENAME_START':
      return { ...state, renaming: action.id, selectedId: action.id };
    case 'RENAME_CANCEL':
      return { ...state, renaming: null };
    case 'SYNC_DIR':
      return { ...state, currentDirId: action.dirId, selectedId: null, renaming: null };
    default:
      return state;
  }
}

function getBreadcrumb(nodes: Record<string, FSNode>, id: string): FSNode[] {
  const crumbs: FSNode[] = [];
  let cur: FSNode | undefined = nodes[id];
  while (cur) {
    crumbs.unshift(cur);
    cur = cur.parentId ? nodes[cur.parentId] : undefined;
  }
  return crumbs;
}

const INITIAL_NAV: NavState = {
  currentDirId: ROOT_ID,
  selectedId: null,
  navHistory: [ROOT_ID],
  navIndex: 0,
  renaming: null,
};

export function FileManager() {
  const fs = useFileSystem();
  const [nav, dispatch] = useReducer(navReducer, INITIAL_NAV);
  const [message, setMessage] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetId: string } | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingFile, setCreatingFile] = useState(false);
  const [newEntryName, setNewEntryName] = useState('Nueva carpeta');
  const [editor, setEditor] = useState<{ id: string; text: string; readOnly: boolean } | null>(null);
  const [chmodTarget, setChmodTarget] = useState<string | null>(null);
  const [chmodInput, setChmodInput] = useState('644');
  const [chownInput, setChownInput] = useState('ana');
  const renameRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLInputElement>(null);

  const showMsg = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 4000);
  };

  const curDir = fs.nodes[nav.currentDirId];
  useEffect(() => {
    if (!curDir) {
      dispatch({ type: 'SYNC_DIR', dirId: ROOT_ID });
    }
  }, [curDir]);

  const children = Object.values(fs.nodes).filter(n => n.parentId === nav.currentDirId);
  const crumbs = getBreadcrumb(fs.nodes, nav.currentDirId);

  const handleDblClick = (node: FSNode) => {
    if (node.type === 'folder') {
      if (!fs.canEnterDir(node.id)) {
        showMsg('Permiso denegado: no puede entrar a esta carpeta (falta permiso de ejecución).');
        return;
      }
      dispatch({ type: 'NAVIGATE', dirId: node.id });
      return;
    }
    const r = fs.readFileContent(node.id);
    if (!r.ok) {
      showMsg(r.error);
      return;
    }
    setEditor({
      id: node.id,
      text: r.data ?? '',
      readOnly: !fs.canWriteNode(node.id),
    });
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    dispatch({ type: 'SELECT', id });
    setContextMenu({ x: e.clientX, y: e.clientY, targetId: id });
  };

  const closeContext = () => setContextMenu(null);

  const commitRename = (id: string, name: string) => {
    const r = fs.renameNode(id, name);
    if (!r.ok) showMsg(r.error);
    dispatch({ type: 'RENAME_CANCEL' });
  };

  const commitCreateFolder = () => {
    const r = fs.createFolder(nav.currentDirId, newEntryName);
    if (!r.ok) showMsg(r.error);
    setCreatingFolder(false);
  };

  const commitCreateFile = () => {
    const r = fs.createFile(nav.currentDirId, newEntryName, '');
    if (!r.ok) showMsg(r.error);
    else setEditor({ id: r.data!, text: '', readOnly: false });
    setCreatingFile(false);
  };

  const startCreateFolder = () => {
    setCreatingFile(false);
    setCreatingFolder(true);
    setNewEntryName('Nueva carpeta');
    setTimeout(() => newRef.current?.select(), 50);
  };

  const startCreateFile = () => {
    setCreatingFolder(false);
    setCreatingFile(true);
    setNewEntryName('nota.txt');
    setTimeout(() => newRef.current?.select(), 50);
  };

  const canGoBack = nav.navIndex > 0;
  const canGoForward = nav.navIndex < nav.navHistory.length - 1;
  const canGoUp = fs.nodes[nav.currentDirId]?.parentId !== null;
  const eff = nav.selectedId ? fs.effectiveBits(nav.selectedId) : null;

  return (
    <div className="fm" onClick={closeContext}>
      <div className="fm-toolbar">
        <button className="fm-btn" disabled={!canGoBack} onClick={() => dispatch({ type: 'NAV_BACK' })} title="Atrás">◀</button>
        <button className="fm-btn" disabled={!canGoForward} onClick={() => dispatch({ type: 'NAV_FORWARD' })} title="Adelante">▶</button>
        <button
          className="fm-btn"
          disabled={!canGoUp}
          onClick={() => dispatch({ type: 'NAV_UP', nodes: fs.nodes })}
          title="Subir"
        >
          ↑
        </button>
        <div className="fm-breadcrumb">
          {crumbs.map((c, i) => (
            <span key={c.id}>
              <span
                className={`fm-crumb ${i === crumbs.length - 1 ? 'active' : 'link'}`}
                onClick={() => {
                  if (i < crumbs.length - 1) {
                    if (!fs.canEnterDir(c.id)) showMsg('Permiso denegado en esta ruta.');
                    else dispatch({ type: 'NAVIGATE', dirId: c.id });
                  }
                }}
              >
                {c.name}
              </span>
              {i < crumbs.length - 1 && <span className="fm-crumb-sep"> › </span>}
            </span>
          ))}
        </div>
        <span className="fm-user-pill" title="Usuario activo del sistema simulado">
          👤 {fs.currentUser}
        </span>
        <button className="fm-btn fm-new-folder" onClick={startCreateFolder} title="Nueva carpeta">+ Carpeta</button>
        <button className="fm-btn fm-new-file" onClick={startCreateFile} title="Nuevo archivo">+ Archivo</button>
      </div>

      {message && <div className="fm-banner">{message}</div>}

      <div className="fm-content" onClick={() => dispatch({ type: 'SELECT', id: null })}>
        {children.map(node => (
          <div
            key={node.id}
            className={`fm-item ${nav.selectedId === node.id ? 'selected' : ''}`}
            onClick={e => {
              e.stopPropagation();
              dispatch({ type: 'SELECT', id: node.id });
            }}
            onDoubleClick={() => handleDblClick(node)}
            onContextMenu={e => handleContextMenu(e, node.id)}
          >
            <div className="fm-item-icon">{node.type === 'folder' ? '📁' : '📄'}</div>
            {nav.renaming === node.id ? (
              <input
                ref={renameRef}
                className="fm-rename-input"
                defaultValue={node.name}
                autoFocus
                onBlur={e => commitRename(node.id, e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename(node.id, (e.target as HTMLInputElement).value);
                  if (e.key === 'Escape') dispatch({ type: 'RENAME_CANCEL' });
                }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <div className="fm-item-name" title={node.name}>{node.name}</div>
            )}
          </div>
        ))}

        {(creatingFolder || creatingFile) && (
          <div className="fm-item">
            <div className="fm-item-icon">{creatingFolder ? '📁' : '📄'}</div>
            <input
              ref={newRef}
              className="fm-rename-input"
              value={newEntryName}
              autoFocus
              onChange={e => setNewEntryName(e.target.value)}
              onBlur={() => {
                if (creatingFolder) commitCreateFolder();
                else commitCreateFile();
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (creatingFolder) commitCreateFolder();
                  else commitCreateFile();
                }
                if (e.key === 'Escape') {
                  setCreatingFolder(false);
                  setCreatingFile(false);
                }
              }}
              onClick={e => e.stopPropagation()}
            />
          </div>
        )}

        {children.length === 0 && !creatingFolder && !creatingFile && (
          <div className="fm-empty">Esta carpeta está vacía</div>
        )}
      </div>

      <div className="fm-statusbar">
        {nav.selectedId && fs.nodes[nav.selectedId] ? (
          <span className="fm-status-detail">
            {fs.nodes[nav.selectedId].name} — dueño: {fs.nodes[nav.selectedId].owner} —{' '}
            {formatPermissionLetters(fs.nodes[nav.selectedId].permissions)}
            {eff && ` — efectivo (tú): r${eff.read ? '+' : '-'} w${eff.write ? '+' : '-'} x${eff.execute ? '+' : '-'}`}
          </span>
        ) : (
          <span>{children.length} elemento{children.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {contextMenu && (
        <div
          className="fm-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => {
              const n = fs.nodes[contextMenu.targetId];
              if (n?.type === 'file') handleDblClick(n);
              else if (n?.type === 'folder') {
                if (!fs.canEnterDir(n.id)) showMsg('Permiso denegado: no puede entrar a esta carpeta.');
                else dispatch({ type: 'NAVIGATE', dirId: n.id });
              }
              closeContext();
            }}
          >
            {fs.nodes[contextMenu.targetId]?.type === 'file' ? 'Abrir / leer' : 'Abrir carpeta'}
          </button>
          <button
            onClick={() => {
              dispatch({ type: 'RENAME_START', id: contextMenu.targetId });
              closeContext();
            }}
          >
            Cambiar nombre
          </button>
          <button
            onClick={() => {
              setChmodTarget(contextMenu.targetId);
              setChmodInput('644');
              setChownInput(fs.nodes[contextMenu.targetId]?.owner ?? 'ana');
              closeContext();
            }}
          >
            Permisos y propietario…
          </button>
          <button
            className="danger"
            onClick={() => {
              const r = fs.deleteNode(contextMenu.targetId);
              if (!r.ok) showMsg(r.error);
              if (nav.selectedId === contextMenu.targetId) dispatch({ type: 'SELECT', id: null });
              closeContext();
            }}
          >
            Eliminar
          </button>
        </div>
      )}

      {editor && (
        <div className="fm-modal-overlay" onClick={() => setEditor(null)}>
          <div className="fm-modal" onClick={e => e.stopPropagation()}>
            <div className="fm-modal-title">
              {fs.nodes[editor.id]?.name ?? 'Archivo'}
              {editor.readOnly && <span className="fm-readonly-tag">solo lectura</span>}
            </div>
            <textarea
              className="fm-editor"
              value={editor.text}
              readOnly={editor.readOnly}
              onChange={e => setEditor({ ...editor, text: e.target.value })}
              spellCheck={false}
            />
            <div className="fm-modal-actions">
              <button type="button" className="fm-btn" onClick={() => setEditor(null)}>Cerrar</button>
              {!editor.readOnly && (
                <button
                  type="button"
                  className="fm-btn fm-primary"
                  onClick={() => {
                    const r = fs.writeFileContent(editor.id, editor.text);
                    if (!r.ok) showMsg(r.error);
                    else {
                      showMsg('Archivo guardado.');
                      setEditor(null);
                    }
                  }}
                >
                  Guardar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {chmodTarget && fs.nodes[chmodTarget] && (
        <div className="fm-modal-overlay" onClick={() => setChmodTarget(null)}>
          <div className="fm-modal fm-modal-small" onClick={e => e.stopPropagation()}>
            <div className="fm-modal-title">Permisos (chmod octal ugo)</div>
            <p className="fm-modal-hint">
              Ejemplo: 644 archivo (dueño rw, otros r), 755 carpeta. Solo el dueño o root pueden chmod.
              chown solo como root.
            </p>
            <label className="fm-field">
              Modo (octal)
              <input value={chmodInput} onChange={e => setChmodInput(e.target.value)} maxLength={3} className="fm-input" />
            </label>
            {fs.currentUser === 'root' && (
              <label className="fm-field">
                Nuevo dueño (chown)
                <select className="fm-input" value={chownInput} onChange={e => setChownInput(e.target.value)}>
                  {fs.knownUsers.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="fm-modal-actions">
              <button type="button" className="fm-btn" onClick={() => setChmodTarget(null)}>Cancelar</button>
              {fs.currentUser === 'root' && (
                <button
                  type="button"
                  className="fm-btn"
                  onClick={() => {
                    const r = fs.chownNode(chmodTarget, chownInput);
                    if (!r.ok) showMsg(r.error);
                    else showMsg('Propietario actualizado.');
                  }}
                >
                  Aplicar chown
                </button>
              )}
              <button
                type="button"
                className="fm-btn fm-primary"
                onClick={() => {
                  const r = fs.chmodNode(chmodTarget, chmodInput);
                  if (!r.ok) showMsg(r.error);
                  else {
                    showMsg('Permisos actualizados.');
                    setChmodTarget(null);
                  }
                }}
              >
                Aplicar chmod
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
