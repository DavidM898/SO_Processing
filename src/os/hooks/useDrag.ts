import { useRef, type PointerEventHandler } from 'react';

export function useDrag(
  onMove: (x: number, y: number) => void,
  disabled: boolean,
): { onPointerDown: PointerEventHandler<HTMLElement> } {
  const dragging = useRef(false);
  const startPos = useRef({ mx: 0, my: 0, wx: 0, wy: 0 });

  const onPointerDown: PointerEventHandler<HTMLElement> = (e) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    dragging.current = true;
    startPos.current = { mx: e.clientX, my: e.clientY, wx: 0, wy: 0 };
    // Store initial window position via callback — caller sets it
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const el = e.currentTarget as HTMLElement;

    const onMove2 = (ev: PointerEvent) => {
      if (!dragging.current) return;
      const dx = ev.clientX - startPos.current.mx;
      const dy = ev.clientY - startPos.current.my;
      onMove(startPos.current.wx + dx, startPos.current.wy + dy);
    };

    const onUp = () => {
      dragging.current = false;
      el.removeEventListener('pointermove', onMove2);
      el.removeEventListener('pointerup', onUp);
    };

    el.addEventListener('pointermove', onMove2);
    el.addEventListener('pointerup', onUp);
  };

  // We need to capture the initial window x/y at the moment of pointerdown.
  // Return a setter so WindowFrame can inject those coords.
  const setStart = (wx: number, wy: number) => {
    startPos.current.wx = wx;
    startPos.current.wy = wy;
  };

  return { onPointerDown: (e) => {
    // Inject current window coords before starting drag
    // WindowFrame sets these via data attributes
    const el = e.currentTarget as HTMLElement;
    const frame = el.closest('[data-win-x]') as HTMLElement | null;
    if (frame) {
      setStart(Number(frame.dataset.winX) || 0, Number(frame.dataset.winY) || 0);
    }
    onPointerDown(e);
  }};
}
