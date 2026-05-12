import { useReducer, useState, useRef } from 'react';
import type { FSNode } from '../../types';
import './FileManager.css';

// ─── Virtual File System ─────────────────────────────────────────────────────

function makeNode(
  id: string,
  name: string,
  type: FSNode['type'],
  parentId: string | null,
): FSNode {
  return { id, name, type, parentId, createdAt: Date.now() };
}

const ROOT_ID = 'root';

const INITIAL_NODES: Record<string, FSNode> = {
  [ROOT_ID]: makeNode(ROOT_ID, 'Este Equipo', 'folder', null),
  'docs':    makeNode('docs',    'Documentos',  'folder', ROOT_ID),
  'imgs':    makeNode('imgs',    'Imágenes',    'folder', ROOT_ID),
  'down':    makeNode('down',    'Descargas',   'folder', ROOT_ID),
  'readme':  { ...makeNode('readme', 'leeme.txt', 'file', 'docs'), content: 'Bienvenido a urlOS', sizeBytes: 20 },
};

// ─── State & Reducer ──────────────────────────────────────────────────────────

interface FMState {
  nodes: Record<string, FSNode>;
  currentDirId: string;
  selectedId: string | null;
  navHistory: string[];
  navIndex: number;
  renaming: string | null;
}

type FMAction =
  | { type: 'NAVIGATE'; dirId: string }
  | { type: 'NAV_BACK' }
  | { type: 'NAV_FORWARD' }
  | { type: 'NAV_UP' }
  | { type: 'SELECT'; id: string | null }
  | { type: 'CREATE_FOLDER'; name: string }
  | { type: 'DELETE'; id: string }
  | { type: 'RENAME_START'; id: string }
  | { type: 'RENAME_COMMIT'; id: string; name: string }
  | { type: 'RENAME_CANCEL' };

function fmReducer(state: FMState, action: FMAction): FMState {
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
      const cur = state.nodes[state.currentDirId];
      if (!cur || cur.parentId === null) return state;
      return fmReducer(state, { type: 'NAVIGATE', dirId: cur.parentId });
    }
    case 'SELECT':
      return { ...state, selectedId: action.id, renaming: null };
    case 'CREATE_FOLDER': {
      const id = crypto.randomUUID();
      const node = makeNode(id, action.name, 'folder', state.currentDirId);
      return { ...state, nodes: { ...state.nodes, [id]: node }, selectedId: id };
    }
    case 'DELETE': {
      // Recursively delete node and all descendants
      const toDelete = collectDescendants(state.nodes, action.id);
      const next = { ...state.nodes };
      for (const id of toDelete) delete next[id];
      return { ...state, nodes: next, selectedId: null };
    }
    case 'RENAME_START':
      return { ...state, renaming: action.id, selectedId: action.id };
    case 'RENAME_COMMIT': {
      if (!action.name.trim()) return { ...state, renaming: null };
      return {
        ...state,
        renaming: null,
        nodes: {
          ...state.nodes,
          [action.id]: { ...state.nodes[action.id], name: action.name.trim() },
        },
      };
    }
    case 'RENAME_CANCEL':
      return { ...state, renaming: null };
    default:
      return state;
  }
}

function collectDescendants(nodes: Record<string, FSNode>, id: string): string[] {
  const result = [id];
  for (const node of Object.values(nodes)) {
    if (node.parentId === id) {
      result.push(...collectDescendants(nodes, node.id));
    }
  }
  return result;
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function getBreadcrumb(nodes: Record<string, FSNode>, id: string): FSNode[] {
  const crumbs: FSNode[] = [];
  let cur: FSNode | undefined = nodes[id];
  while (cur) {
    crumbs.unshift(cur);
    cur = cur.parentId ? nodes[cur.parentId] : undefined;
  }
  return crumbs;
}

// ─── Component ────────────────────────────────────────────────────────────────

const INITIAL_FM_STATE: FMState = {
  nodes: INITIAL_NODES,
  currentDirId: ROOT_ID,
  selectedId: null,
  navHistory: [ROOT_ID],
  navIndex: 0,
  renaming: null,
};

export function FileManager() {
  const [fm, dispatch] = useReducer(fmReducer, INITIAL_FM_STATE);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetId: string } | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('Nueva carpeta');
  const renameRef = useRef<HTMLInputElement>(null);
  const newFolderRef = useRef<HTMLInputElement>(null);

  const children = Object.values(fm.nodes).filter(n => n.parentId === fm.currentDirId);
  const crumbs = getBreadcrumb(fm.nodes, fm.currentDirId);

  const handleDblClick = (node: FSNode) => {
    if (node.type === 'folder') {
      dispatch({ type: 'NAVIGATE', dirId: node.id });
    }
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    dispatch({ type: 'SELECT', id });
    setContextMenu({ x: e.clientX, y: e.clientY, targetId: id });
  };

  const closeContext = () => setContextMenu(null);

  const startCreateFolder = () => {
    setCreatingFolder(true);
    setNewFolderName('Nueva carpeta');
    setTimeout(() => newFolderRef.current?.select(), 50);
  };

  const commitCreateFolder = () => {
    if (newFolderName.trim()) {
      dispatch({ type: 'CREATE_FOLDER', name: newFolderName.trim() });
    }
    setCreatingFolder(false);
  };

  const canGoBack = fm.navIndex > 0;
  const canGoForward = fm.navIndex < fm.navHistory.length - 1;
  const canGoUp = fm.nodes[fm.currentDirId]?.parentId !== null;

  return (
    <div className="fm" onClick={closeContext}>
      {/* Toolbar */}
      <div className="fm-toolbar">
        <button className="fm-btn" disabled={!canGoBack} onClick={() => dispatch({ type: 'NAV_BACK' })} title="Atrás">◀</button>
        <button className="fm-btn" disabled={!canGoForward} onClick={() => dispatch({ type: 'NAV_FORWARD' })} title="Adelante">▶</button>
        <button className="fm-btn" disabled={!canGoUp} onClick={() => dispatch({ type: 'NAV_UP' })} title="Subir">↑</button>
        <div className="fm-breadcrumb">
          {crumbs.map((c, i) => (
            <span key={c.id}>
              <span
                className={`fm-crumb ${i === crumbs.length - 1 ? 'active' : 'link'}`}
                onClick={() => i < crumbs.length - 1 && dispatch({ type: 'NAVIGATE', dirId: c.id })}
              >
                {c.name}
              </span>
              {i < crumbs.length - 1 && <span className="fm-crumb-sep"> › </span>}
            </span>
          ))}
        </div>
        <button className="fm-btn fm-new-folder" onClick={startCreateFolder} title="Nueva carpeta">+ Carpeta</button>
      </div>

      {/* File grid */}
      <div className="fm-content" onClick={() => dispatch({ type: 'SELECT', id: null })}>
        {children.map(node => (
          <div
            key={node.id}
            className={`fm-item ${fm.selectedId === node.id ? 'selected' : ''}`}
            onClick={e => { e.stopPropagation(); dispatch({ type: 'SELECT', id: node.id }); }}
            onDoubleClick={() => handleDblClick(node)}
            onContextMenu={e => handleContextMenu(e, node.id)}
          >
            <div className="fm-item-icon">{node.type === 'folder' ? '📁' : '📄'}</div>
            {fm.renaming === node.id ? (
              <input
                ref={renameRef}
                className="fm-rename-input"
                defaultValue={node.name}
                autoFocus
                onBlur={e => dispatch({ type: 'RENAME_COMMIT', id: node.id, name: e.target.value })}
                onKeyDown={e => {
                  if (e.key === 'Enter') dispatch({ type: 'RENAME_COMMIT', id: node.id, name: (e.target as HTMLInputElement).value });
                  if (e.key === 'Escape') dispatch({ type: 'RENAME_CANCEL' });
                }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <div className="fm-item-name" title={node.name}>{node.name}</div>
            )}
          </div>
        ))}

        {/* Inline new-folder input */}
        {creatingFolder && (
          <div className="fm-item">
            <div className="fm-item-icon">📁</div>
            <input
              ref={newFolderRef}
              className="fm-rename-input"
              value={newFolderName}
              autoFocus
              onChange={e => setNewFolderName(e.target.value)}
              onBlur={commitCreateFolder}
              onKeyDown={e => {
                if (e.key === 'Enter') commitCreateFolder();
                if (e.key === 'Escape') setCreatingFolder(false);
              }}
              onClick={e => e.stopPropagation()}
            />
          </div>
        )}

        {children.length === 0 && !creatingFolder && (
          <div className="fm-empty">Esta carpeta está vacía</div>
        )}
      </div>

      {/* Status bar */}
      <div className="fm-statusbar">
        {fm.selectedId
          ? `1 elemento seleccionado — ${fm.nodes[fm.selectedId]?.name ?? ''}`
          : `${children.length} elemento${children.length !== 1 ? 's' : ''}`}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fm-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button onClick={() => {
            dispatch({ type: 'RENAME_START', id: contextMenu.targetId });
            closeContext();
          }}>Cambiar nombre</button>
          <button className="danger" onClick={() => {
            dispatch({ type: 'DELETE', id: contextMenu.targetId });
            closeContext();
          }}>Eliminar</button>
        </div>
      )}
    </div>
  );
}
