import { useMemo, useState, useCallback } from 'react';
import { useFileSystem } from '../../context/FileSystemContext';
import './TextEditor.css';

export function TextEditor() {
  const fs = useFileSystem();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [newName, setNewName] = useState('nuevo.txt');
  const [status, setStatus] = useState('');

  const cwdFiles = useMemo(
    () =>
      Object.values(fs.nodes)
        .filter(n => n.type === 'file' && n.parentId === fs.terminalCwdId)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [fs.nodes, fs.terminalCwdId],
  );

  const cwdPath = fs.pathOf(fs.terminalCwdId);

  const loadFile = useCallback(
    (id: string | null) => {
      if (!id) {
        setActiveId(null);
        setText('');
        setStatus('Sin archivo abierto. Elija uno o guarde como nuevo.');
        return;
      }
      const r = fs.readFileContent(id);
      if (!r.ok) {
        setStatus(r.error);
        return;
      }
      setActiveId(id);
      setText(r.data ?? '');
      const name = fs.nodes[id]?.name ?? id;
      setStatus(`Abierto: ${name}`);
    },
    [fs],
  );

  const handleNew = () => {
    setActiveId(null);
    setText('');
    setStatus('Borrador nuevo. Guarde con un nombre en el directorio actual.');
  };

  const handleSave = () => {
    if (activeId) {
      const r = fs.writeFileContent(activeId, text);
      setStatus(r.ok ? 'Guardado.' : r.error);
      return;
    }
    const name = newName.trim() || 'nuevo.txt';
    const r = fs.createFile(fs.terminalCwdId, name, text);
    if (!r.ok) {
      setStatus(r.error);
      return;
    }
    setActiveId(r.data!);
    setStatus(`Creado y guardado: ${name}`);
  };

  return (
    <div className="text-editor">
      <div className="te-toolbar">
        <label className="te-label">
          Carpeta actual
          <span className="te-path" title={cwdPath}>
            {cwdPath}
          </span>
        </label>
        <label className="te-label">
          Archivo
          <select
            className="te-select"
            value={activeId ?? ''}
            onChange={e => loadFile(e.target.value || null)}
          >
            <option value="">— Nuevo / sin abrir —</option>
            {cwdFiles.map(f => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        {!activeId && (
          <label className="te-label te-grow">
            Nombre al guardar
            <input
              className="te-input"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              spellCheck={false}
            />
          </label>
        )}
        <div className="te-actions">
          <button type="button" className="te-btn" onClick={handleNew}>
            Nuevo
          </button>
          <button type="button" className="te-btn te-btn-primary" onClick={handleSave}>
            Guardar
          </button>
        </div>
      </div>
      {status && <div className="te-status">{status}</div>}
      <textarea
        className="te-area"
        value={text}
        onChange={e => setText(e.target.value)}
        spellCheck={false}
        placeholder="Escriba aquí… Use `cd` en la terminal para cambiar la carpeta de guardado."
      />
    </div>
  );
}
