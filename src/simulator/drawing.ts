import type p5 from 'p5';
import type { Zone, Color } from './types';
import { COLORS, W, H } from './types';
import { Car } from './Car';
import { SimMutex } from './primitives';

export function drawPanel(p: p5, x: number, y: number, w: number, h: number): void {
  const c = COLORS.PANEL_BG;
  p.fill(c.r, c.g, c.b, c.a ?? 255);
  p.noStroke();
  p.rect(x, y, w, h, 8);
}

export function drawLabel(
  p: p5,
  txt: string,
  x: number,
  y: number,
  sz: number = 11,
  col?: Color
): void {
  if (col) {
    p.fill(col.r, col.g, col.b, col.a ?? 255);
  } else {
    p.fill(220);
  }
  p.textSize(sz);
  p.textAlign(p.LEFT, p.TOP);
  p.text(txt, x, y);
}

export function pointInRect(
  px: number,
  py: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): boolean {
  return rx <= px && px <= rx + rw && ry <= py && py <= ry + rh;
}

export function getParkedSlots(cars: Car[]): Set<number> {
  const slots = new Set<number>();
  for (const c of cars) {
    if (c.state === 'PARKED' && c.parkSlot !== null) {
      slots.add(c.parkSlot);
    }
  }
  return slots;
}

export function firstFreeSlot(cars: Car[], cap: number): number {
  const used = getParkedSlots(cars);
  for (let i = 0; i < cap; i++) {
    if (!used.has(i)) return i;
  }
  return 0;
}

export function getCarById(cars: Car[], cid: number | null): Car | null {
  if (cid === null) return null;
  for (const c of cars) {
    if (c.id === cid) return c;
  }
  return null;
}

export function mutexLightStates(
  cars: Car[],
  mutex: SimMutex,
  frameCount: number
): [string, string] {
  const ownerCar = getCarById(cars, mutex.owner);
  if (ownerCar !== null) {
    if (ownerCar.dirX !== 0) {
      return ['green', 'red'];
    }
    return ['red', 'green'];
  }
  if (mutex.queue.length > 0) {
    const qcar = getCarById(cars, mutex.queue[0]);
    if (qcar !== null) {
      if (qcar.dirX !== 0) {
        return ['green', 'red'];
      }
      return ['red', 'green'];
    }
  }
  if (Math.floor(frameCount / 60) % 2 === 0) {
    return ['green', 'red'];
  }
  return ['red', 'green'];
}

export function drawSceneBg(p: p5): void {
  const g = COLORS.GRASS;
  p.background(g.r, g.g, g.b);
  p.noStroke();
  p.fill(58, 100, 58);
  p.rect(0, 0, W, H);
  p.fill(88, 142, 86, 70);
  p.rect(25, 25, 220, 120, 18);
  p.rect(W - 255, 35, 220, 130, 18);
  p.rect(40, H - 165, 235, 110, 18);
  p.rect(W - 290, H - 180, 245, 120, 18);
  p.fill(72, 112, 70, 90);
  p.ellipse(170, 120, 130, 70);
  p.ellipse(W - 160, 120, 120, 72);
  p.ellipse(170, H - 110, 140, 82);
  p.ellipse(W - 170, H - 115, 135, 76);
}

export function drawHRoad(p: p5, x: number, y: number, w: number, h: number): void {
  p.push();
  const rc = COLORS.ROAD;
  p.noStroke();
  p.fill(rc.r, rc.g, rc.b);
  p.rect(x, y, w, h);
  p.fill(38, 40, 46, 120);
  p.rect(x, y, w, 10);
  p.rect(x, y + h - 10, w, 10);
  p.stroke(255, 255, 255, 55);
  p.strokeWeight(2);
  p.line(x + 16, y + 18, x + w - 16, y + 18);
  p.line(x + 16, y + h - 18, x + w - 16, y + h - 18);
  const lc = COLORS.LANE_LINE;
  p.stroke(lc.r, lc.g, lc.b, lc.a ?? 255);
  p.strokeWeight(3);
  const yy = y + h / 2;
  let xx = x + 22;
  while (xx < x + w - 22) {
    p.line(xx, yy, Math.min(xx + 28, x + w - 22), yy);
    xx += 48;
  }
  p.pop();
}

export function drawVRoad(p: p5, x: number, y: number, w: number, h: number): void {
  p.push();
  const rc = COLORS.ROAD;
  p.noStroke();
  p.fill(rc.r, rc.g, rc.b);
  p.rect(x, y, w, h);
  p.fill(38, 40, 46, 120);
  p.rect(x, y, 10, h);
  p.rect(x + w - 10, y, 10, h);
  p.stroke(255, 255, 255, 55);
  p.strokeWeight(2);
  p.line(x + 18, y + 16, x + 18, y + h - 16);
  p.line(x + w - 18, y + 16, x + w - 18, y + h - 16);
  const lc = COLORS.LANE_LINE;
  p.stroke(lc.r, lc.g, lc.b, lc.a ?? 255);
  p.strokeWeight(3);
  const xm = x + w / 2;
  let yy = y + 22;
  while (yy < y + h - 22) {
    p.line(xm, yy, xm, Math.min(yy + 28, y + h - 22));
    yy += 48;
  }
  p.pop();
}

export function drawCrosswalks(p: p5, z: Zone): void {
  const { x: zx, y: zy, w: zw, h: zh } = z;
  p.push();
  p.noStroke();
  p.fill(255, 255, 255, 115);
  let i = 0;
  while (i < zh - 40) {
    p.rect(zx - 22, zy + 20 + i, 14, 10, 2);
    p.rect(zx + zw + 8, zy + 20 + i, 14, 10, 2);
    i += 20;
  }
  i = 0;
  while (i < zw - 40) {
    p.rect(zx + 20 + i, zy - 22, 10, 14, 2);
    p.rect(zx + 20 + i, zy + zh + 8, 10, 14, 2);
    i += 20;
  }
  p.stroke(255, 255, 255, 120);
  p.strokeWeight(3);
  p.line(zx - 5, zy + 18, zx - 5, zy + zh - 18);
  p.line(zx + zw + 5, zy + 18, zx + zw + 5, zy + zh - 18);
  p.line(zx + 18, zy - 5, zx + zw - 18, zy - 5);
  p.line(zx + 18, zy + zh + 5, zx + zw - 18, zy + zh + 5);
  p.pop();
}

export function drawTrafficLight(
  p: p5,
  x: number,
  y: number,
  state: string = 'red',
  vertical: boolean = true,
  scale: number = 1.0
): void {
  p.push();
  p.translate(x, y);
  if (!vertical) {
    p.rotate(p.HALF_PI);
  }
  p.stroke(40);
  p.strokeWeight(4 * scale);
  p.line(0, 0, 0, 34 * scale);
  p.noStroke();
  p.fill(32, 34, 38);
  p.rect(-10 * scale, -30 * scale, 20 * scale, 34 * scale, 5 * scale);

  // Default inactive lights
  p.fill(70);
  p.ellipse(0, -22 * scale, 8 * scale, 8 * scale);
  p.ellipse(0, -14 * scale, 8 * scale, 8 * scale);
  p.ellipse(0, -6 * scale, 8 * scale, 8 * scale);

  // Active light
  if (state === 'red') {
    p.fill(230, 70, 70);
    p.ellipse(0, -22 * scale, 8 * scale, 8 * scale);
  } else if (state === 'yellow') {
    p.fill(255, 210, 70);
    p.ellipse(0, -14 * scale, 8 * scale, 8 * scale);
  } else if (state === 'green') {
    p.fill(50, 220, 110);
    p.ellipse(0, -6 * scale, 8 * scale, 8 * scale);
  }
  p.pop();
}

export function drawBarrier(p: p5, x: number, y: number, isOpen: boolean, vertical: boolean = true): void {
  p.push();
  p.translate(x, y);
  if (vertical) {
    p.rotate(p.HALF_PI);
  }
  p.noStroke();
  p.fill(185, 188, 195);
  p.rect(-8, -10, 16, 20, 4);
  p.stroke(235, 235, 240);
  p.strokeWeight(2);
  p.line(-4, -5, 4, -5);
  p.stroke(220, 70, 70);
  p.strokeWeight(5);
  const ang = isOpen ? -p.PI / 3 : 0;
  p.rotate(ang);
  p.line(0, 0, 58, 0);
  p.stroke(255);
  p.strokeWeight(2);
  let i = 10;
  while (i < 52) {
    p.line(i, -2, i + 4, 2);
    i += 14;
  }
  p.pop();
}

export function drawParkingSign(p: p5, x: number, y: number, label: string = 'P'): void {
  p.push();
  p.stroke(60);
  p.strokeWeight(4);
  p.line(x, y, x, y + 48);
  p.fill(50, 110, 220);
  p.stroke(255);
  p.strokeWeight(2);
  p.rect(x - 18, y - 34, 36, 30, 6);
  p.fill(255);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(20);
  p.text(label, x, y - 19);
  p.pop();
}

export function drawDigitalBoard(
  p: p5,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  value: string,
  good: boolean = true
): void {
  p.push();
  p.noStroke();
  p.fill(28, 30, 35);
  p.rect(x, y, w, h, 8);
  if (good) {
    p.fill(52, 240, 120);
  } else {
    p.fill(255, 90, 90);
  }
  p.rect(x + 8, y + 18, w - 16, h - 26, 4);
  p.fill(15, 20, 15);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(11);
  p.text(title, x + w / 2, y + 10);
  p.textSize(18);
  p.text(value, x + w / 2, y + h / 2 + 6);
  p.pop();
}

export function drawWater(p: p5, x: number, y: number, w: number, h: number): void {
  p.push();
  const wc = COLORS.WATER;
  p.noStroke();
  p.fill(wc.r, wc.g, wc.b);
  p.rect(x, y, w, h);
  p.stroke(255, 255, 255, 30);
  p.strokeWeight(2);
  let yy = y + 18;
  while (yy < y + h - 10) {
    p.line(x + 16, yy, x + w - 16, yy);
    yy += 24;
  }
  p.pop();
}

export function drawResourceGate(
  p: p5,
  zone: Zone,
  title: string,
  accent: Color,
  owner: number | null = null,
  subtitle: string = ''
): void {
  const { x, y, w, h } = zone;
  p.push();
  p.fill(72, 74, 82);
  p.stroke(accent.r, accent.g, accent.b, 190);
  p.strokeWeight(3);
  p.rect(x, y, w, h, 12);
  p.fill(96, 100, 110);
  p.rect(x + 18, y + 36, w - 36, h - 56, 10);
  p.fill(35, 38, 45);
  p.rect(x + w / 2 - 36, y + h - 74, 72, 54, 8);

  if (owner) {
    p.fill(255, 90, 90);
  } else {
    p.fill(60, 220, 120);
  }
  p.ellipse(x + 28, y + 28, 14, 14);

  p.noFill();
  p.stroke(255, 230);
  p.arc(x + w - 40, y + 34, 22, 20, p.PI, p.TWO_PI);
  p.fill(255, 230);
  p.noStroke();
  p.rect(x + w - 51, y + 34, 22, 18, 4);

  p.fill(240);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(18);
  p.text(title, x + w / 2, y + 26);

  if (subtitle) {
    p.fill(225, 225, 230);
    p.textSize(10);
    p.text(subtitle, x + w / 2, y + 46);
  }

  p.fill(255);
  p.textSize(10);
  p.text(`Owner: ${owner ?? 'Libre'}`, x + w / 2, y + h - 18);
  p.pop();
}

export function drawStatusChip(p: p5, x: number, y: number, col: Color, label: string): void {
  p.push();
  p.fill(col.r, col.g, col.b);
  p.stroke(18);
  p.strokeWeight(1);
  p.rect(x, y - 6, 14, 12, 4);
  p.fill(220);
  p.textAlign(p.LEFT, p.CENTER);
  p.textSize(9);
  p.text(label, x + 19, y);
  p.pop();
}
