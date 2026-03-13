import { useState } from 'react';
import './Controls.css';

interface ControlsProps {
  currentMode: number;
  showInstructions: boolean;
  onModeChange: (mode: number) => void;
  onToggleInstructions: () => void;
  onReset: () => void;
  onSpawn: (direction?: string) => void;
  onSpecialAction: (action: string) => void;
  m4Cap?: number;
  m6Policy?: number;
  m7Prevent?: boolean;
  m8NextDest?: string;
}

const MODE_NAMES = [
  'Info',
  '1: Race',
  '2: Critica',
  '3: Mutex',
  '4: Semaforo',
  '5: Monitor',
  '6: Planif',
  '7: Deadlock',
  '8: Completo',
];

const POLICY_NAMES = ['FIFO', 'SJF', 'RR'];

export default function Controls({
  currentMode,
  showInstructions,
  onModeChange,
  onToggleInstructions,
  onReset,
  onSpawn,
  onSpecialAction,
  m4Cap = 3,
  m6Policy = 0,
  m7Prevent = false,
  m8NextDest = 'auto',
}: ControlsProps) {
  const [showModeSelector, setShowModeSelector] = useState(false);

  const renderModeSpecificControls = () => {
    if (showInstructions) return null;

    switch (currentMode) {
      case 1:
      case 2:
        return (
          <div className="control-group">
            <button className="ctrl-btn spawn" onClick={() => onSpawn()}>
              Lanzar
            </button>
            <button className="ctrl-btn" onClick={() => onSpawn('H')}>
              Horizontal
            </button>
            <button className="ctrl-btn" onClick={() => onSpawn('V')}>
              Vertical
            </button>
          </div>
        );

      case 3:
        return (
          <div className="control-group">
            <button className="ctrl-btn spawn" onClick={() => onSpawn()}>
              Lanzar Carro
            </button>
          </div>
        );

      case 4:
        return (
          <div className="control-group">
            <button className="ctrl-btn spawn" onClick={() => onSpawn()}>
              Lanzar
            </button>
            <button className="ctrl-btn" onClick={() => onSpecialAction('k')}>
              Cupos: {m4Cap}
            </button>
          </div>
        );

      case 5:
        return (
          <div className="control-group">
            <button className="ctrl-btn spawn" onClick={() => onSpawn()}>
              Lanzar
            </button>
          </div>
        );

      case 6:
        return (
          <div className="control-group">
            <button className="ctrl-btn spawn" onClick={() => onSpawn()}>
              Lanzar
            </button>
            <button className="ctrl-btn" onClick={() => onSpecialAction('p')}>
              {POLICY_NAMES[m6Policy]}
            </button>
          </div>
        );

      case 7:
        return (
          <div className="control-group">
            <button className="ctrl-btn spawn" onClick={() => onSpawn()}>
              Lanzar Par
            </button>
            <button
              className={`ctrl-btn ${m7Prevent ? 'active' : ''}`}
              onClick={() => onSpecialAction('e')}
            >
              Prevenir: {m7Prevent ? 'ON' : 'OFF'}
            </button>
            <button className="ctrl-btn danger" onClick={() => onSpecialAction('f')}>
              Resolver
            </button>
          </div>
        );

      case 8:
        return (
          <div className="control-group">
            <button className="ctrl-btn spawn" onClick={() => onSpawn()}>
              Lanzar
            </button>
            <div className="dest-buttons">
              <button
                className={`ctrl-btn small ${m8NextDest === 'int' ? 'active' : ''}`}
                onClick={() => onSpecialAction('i')}
              >
                Int
              </button>
              <button
                className={`ctrl-btn small ${m8NextDest === 'br' ? 'active' : ''}`}
                onClick={() => onSpecialAction('b')}
              >
                Puente
              </button>
              <button
                className={`ctrl-btn small ${m8NextDest === 'pk' ? 'active' : ''}`}
                onClick={() => onSpecialAction('p')}
              >
                Park
              </button>
              <button
                className={`ctrl-btn small ${m8NextDest === 'auto' ? 'active' : ''}`}
                onClick={() => onSpecialAction('0')}
              >
                Auto
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="controls-container">
      {/* Top bar with mode selector */}
      <div className="top-controls">
        <button
          className="ctrl-btn mode-btn"
          onClick={() => setShowModeSelector(!showModeSelector)}
        >
          {MODE_NAMES[currentMode]} ▼
        </button>

        <button className="ctrl-btn info-btn" onClick={onToggleInstructions}>
          {showInstructions ? 'Jugar' : 'Info'}
        </button>

        {!showInstructions && (
          <button className="ctrl-btn reset-btn" onClick={onReset}>
            Reset
          </button>
        )}
      </div>

      {/* Mode selector dropdown */}
      {showModeSelector && (
        <div className="mode-selector">
          {MODE_NAMES.map((name, index) => (
            <button
              key={index}
              className={`mode-option ${currentMode === index ? 'active' : ''}`}
              onClick={() => {
                onModeChange(index);
                setShowModeSelector(false);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Mode-specific controls */}
      <div className="bottom-controls">{renderModeSpecificControls()}</div>
    </div>
  );
}
