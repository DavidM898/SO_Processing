import { useEffect, useRef } from 'react';
import SimulatorWrapper from '../../../simulator/SimulatorWrapper';
import './GameWindow.css';

export function GameWindow() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // SimulatorWrapper already has internal p5 scaling logic (p.windowResized).
    // It reads canvasContainerRef.clientWidth and resizes the canvas accordingly.
    // We just need to trigger that handler whenever the OS window changes size,
    // and once on mount (with a small delay) to ensure layout is settled after
    // the lazy import resolves and the DOM is fully painted.
    const triggerResize = () => window.dispatchEvent(new Event('resize'));

    const t = setTimeout(triggerResize, 30);

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
        overflow: 'auto',
        background: '#1a1a2e',
      }}
    >
      <SimulatorWrapper />
    </div>
  );
}
