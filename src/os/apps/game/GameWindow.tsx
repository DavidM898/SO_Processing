import { useEffect, useRef } from 'react';
import SimulatorWrapper from '../../../simulator/SimulatorWrapper';
import './GameWindow.css';

export function GameWindow() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // p5 escucha `windowResized`; al abrir la ventana desde la terminal el flex aún no ha medido.
    const triggerResize = () => window.dispatchEvent(new Event('resize'));

    const t = setTimeout(triggerResize, 30);
    queueMicrotask(triggerResize);
    requestAnimationFrame(() => requestAnimationFrame(triggerResize));

    const ro = new ResizeObserver(triggerResize);
    ro.observe(container);

    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="game-window-container"
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#1a1a2e',
      }}
    >
      <SimulatorWrapper />
    </div>
  );
}
