import { useEffect, useRef } from 'react';
import p5 from 'p5';

interface CpuGraphProps {
  history: number[];   // array of 0-100 values, oldest first
  width?: number;
  height?: number;
}

export function CpuGraph({ history, width = 640, height = 120 }: CpuGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5Ref = useRef<p5 | null>(null);
  const histRef = useRef<number[]>(history);

  // Keep histRef in sync on every render (avoids stale closure in sketch)
  histRef.current = history;

  useEffect(() => {
    if (!containerRef.current) return;

    const sketch = (p: p5) => {
      p.setup = () => {
        p.createCanvas(width, height).parent(containerRef.current!);
        p.frameRate(10);
        p.noLoop();
      };

      p.draw = () => {
        const data = histRef.current;
        const W = p.width;
        const H = p.height;
        const pad = 4;

        // Background
        p.background(18, 18, 18);

        // Grid lines
        p.stroke(40, 40, 40);
        p.strokeWeight(1);
        for (let y = 0; y <= 4; y++) {
          const yy = pad + ((H - pad * 2) * y) / 4;
          p.line(pad, yy, W - pad, yy);
        }

        // Y axis labels
        p.noStroke();
        p.fill(80, 80, 80);
        p.textSize(9);
        p.textAlign(p.RIGHT, p.CENTER);
        for (let i = 0; i <= 4; i++) {
          const val = 100 - i * 25;
          const yy = pad + ((H - pad * 2) * i) / 4;
          p.text(`${val}%`, pad + 22, yy);
        }

        // Graph line (filled area)
        if (data.length >= 2) {
          const step = (W - pad * 2 - 28) / (data.length - 1);
          const xOff = pad + 28;

          // Filled area
          p.beginShape();
          p.noStroke();
          p.fill(0, 120, 212, 60);
          p.vertex(xOff, H - pad);
          for (let i = 0; i < data.length; i++) {
            const x = xOff + i * step;
            const y = pad + ((H - pad * 2) * (100 - data[i])) / 100;
            p.vertex(x, y);
          }
          p.vertex(xOff + (data.length - 1) * step, H - pad);
          p.endShape(p.CLOSE);

          // Line
          p.beginShape();
          p.noFill();
          p.stroke(0, 120, 212);
          p.strokeWeight(1.5);
          for (let i = 0; i < data.length; i++) {
            const x = xOff + i * step;
            const y = pad + ((H - pad * 2) * (100 - data[i])) / 100;
            p.vertex(x, y);
          }
          p.endShape();

          // Latest value dot
          const lastX = xOff + (data.length - 1) * step;
          const lastY = pad + ((H - pad * 2) * (100 - data[data.length - 1])) / 100;
          p.noStroke();
          p.fill(0, 180, 255);
          p.circle(lastX, lastY, 5);

          // Latest value label
          p.fill(0, 180, 255);
          p.textSize(10);
          p.textAlign(p.LEFT, p.CENTER);
          p.text(`${Math.round(data[data.length - 1])}%`, lastX + 6, lastY);
        }
      };
    };

    p5Ref.current = new p5(sketch);

    return () => {
      p5Ref.current?.remove();
      p5Ref.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  // Redraw on every history change
  useEffect(() => {
    p5Ref.current?.redraw();
  }, [history]);

  return <div ref={containerRef} style={{ lineHeight: 0 }} />;
}
