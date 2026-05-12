import { useWindows } from '../context/WindowContext';
import { WindowFrame } from './WindowFrame';

export function WindowLayer() {
  const { state } = useWindows();

  const visible = [...state.windows]
    .filter(w => !w.minimized)
    .sort((a, b) => a.zIndex - b.zIndex);

  return (
    <>
      {visible.map(win => (
        <WindowFrame key={win.id} win={win} />
      ))}
    </>
  );
}
