import type p5 from 'p5';
import type { CarState, Zone } from './types';
import { COLORS, W, H } from './types';

let nextId = 0;

export function resetCarId(): void {
  nextId = 0;
}

export class Car {
  id: number;
  x: number;
  y: number;
  speed: number;
  state: CarState = 'RUN';
  sz: number = 22;
  framesIn: number = 0;
  crossTime: number;
  held: string[] = [];
  waitFrames: number = 0;
  stopped: boolean = false;
  parkSlot: number | null = null;
  dirX: number;
  dirY: number;
  dx: number;
  dy: number;
  dest?: string;
  targetOrder?: string[];

  constructor(x: number, y: number, dirX: number, dirY: number, spd: number = 2.0) {
    nextId++;
    this.id = nextId;
    this.x = x;
    this.y = y;
    this.speed = spd;
    this.crossTime = Math.floor(Math.random() * 61) + 40; // 40-100

    this.dirX = dirX > 0 ? 1 : dirX < 0 ? -1 : 0;
    this.dirY = dirY > 0 ? 1 : dirY < 0 ? -1 : 0;
    this.dx = this.dirX * this.speed;
    this.dy = this.dirY * this.speed;
  }

  move(): void {
    if (!this.stopped) {
      this.x += this.dx;
      this.y += this.dy;
    }
  }

  stop(): void {
    this.stopped = true;
    this.dx = 0;
    this.dy = 0;
  }

  resume(): void {
    this.stopped = false;
    this.dx = this.dirX * this.speed;
    this.dy = this.dirY * this.speed;
  }

  offscreen(): boolean {
    return this.x > W + 40 || this.x < -40 || this.y > H + 40 || this.y < -40;
  }

  inZone(z: Zone): boolean {
    return z.x <= this.x && this.x <= z.x + z.w && z.y <= this.y && this.y <= z.y + z.h;
  }

  approaching(z: Zone, d: number = 40): boolean {
    if (this.dirX > 0)
      return z.x - d <= this.x && this.x <= z.x && z.y - 10 <= this.y && this.y <= z.y + z.h + 10;
    if (this.dirX < 0)
      return (
        z.x + z.w <= this.x &&
        this.x <= z.x + z.w + d &&
        z.y - 10 <= this.y &&
        this.y <= z.y + z.h + 10
      );
    if (this.dirY > 0)
      return z.x - 10 <= this.x && this.x <= z.x + z.w + 10 && z.y - d <= this.y && this.y <= z.y;
    if (this.dirY < 0)
      return (
        z.x - 10 <= this.x &&
        this.x <= z.x + z.w + 10 &&
        z.y + z.h <= this.y &&
        this.y <= z.y + z.h + d
      );
    return false;
  }

  clicked(mx: number, my: number): boolean {
    const dx = mx - this.x;
    const dy = my - this.y;
    return Math.sqrt(dx * dx + dy * dy) < this.sz + 4;
  }

  headingAngle(): number {
    if (this.dirX > 0) return 0;
    if (this.dirX < 0) return Math.PI;
    if (this.dirY > 0) return Math.PI / 2;
    return -Math.PI / 2;
  }

  draw(p: p5, isSelected: boolean = false): void {
    let base: { r: number; g: number; b: number };

    switch (this.state) {
      case 'RUN':
        base = COLORS.C_RUN;
        break;
      case 'WAIT':
      case 'WAIT_MUTEX':
      case 'WAIT_SEM':
      case 'WAIT_MON':
        base = COLORS.C_WAIT;
        break;
      case 'IN_CS':
      case 'PARKED':
        base = COLORS.C_IN_CS;
        break;
      case 'DEADLOCK':
        base = COLORS.C_DEAD;
        break;
      case 'RACE_ERR':
        base = COLORS.C_ERROR;
        break;
      default:
        base = { r: 150, g: 150, b: 150 };
    }

    const tint = (col: { r: number; g: number; b: number }, delta: number) => ({
      r: Math.max(0, Math.min(255, col.r + delta)),
      g: Math.max(0, Math.min(255, col.g + delta)),
      b: Math.max(0, Math.min(255, col.b + delta)),
    });

    const body = tint(base, -8);
    const roof = tint(base, 24);

    p.push();
    p.translate(this.x, this.y);

    if (isSelected) {
      p.noFill();
      p.stroke(255, 255, 255, 205);
      p.strokeWeight(3);
      p.ellipse(0, 0, 42, 42);
    }

    if (this.state === 'IN_CS' || this.state === 'PARKED') {
      p.noFill();
      p.stroke(50, 220, 110, 150);
      p.strokeWeight(2);
      p.ellipse(0, 0, 38, 38);
    } else if (this.state === 'DEADLOCK') {
      p.noFill();
      p.stroke(170, 50, 220, 185);
      p.strokeWeight(2);
      p.ellipse(0, 0, 38, 38);
    } else if (this.state === 'RACE_ERR') {
      p.noFill();
      p.stroke(255, 60, 60, 185);
      p.strokeWeight(2);
      p.ellipse(0, 0, 40, 40);
    } else if (this.state.includes('WAIT')) {
      p.noFill();
      p.stroke(255, 210, 70, 135);
      p.strokeWeight(2);
      p.ellipse(0, 0, 36, 36);
    }

    p.rotate(this.headingAngle());
    p.noStroke();
    p.fill(0, 0, 0, 60);
    p.ellipse(2, 11, 31, 9);

    // Wheels
    p.fill(24);
    p.rect(-13, -12, 7, 5, 2);
    p.rect(6, -12, 7, 5, 2);
    p.rect(-13, 7, 7, 5, 2);
    p.rect(6, 7, 7, 5, 2);

    // Body
    p.stroke(24);
    p.strokeWeight(1.2);
    p.fill(body.r, body.g, body.b);
    p.rect(-16, -10, 32, 20, 6);

    // Roof
    p.fill(roof.r, roof.g, roof.b);
    p.rect(-10, -7, 20, 14, 5);

    // Windows
    p.fill(205, 230, 255, 205);
    p.rect(-7, -5, 14, 10, 3);
    p.stroke(160, 190, 220, 120);
    p.line(0, -5, 0, 5);

    // Headlights
    p.noStroke();
    p.fill(255, 245, 180);
    p.ellipse(15, -4, 3, 3);
    p.ellipse(15, 4, 3, 3);

    // Taillights
    p.fill(255, 80, 70);
    p.ellipse(-15, -4, 3, 3);
    p.ellipse(-15, 4, 3, 3);

    // ID
    p.fill(255);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(9);
    p.text(String(this.id), 0, 0);

    // Wait indicator
    if (this.state.includes('WAIT')) {
      p.fill(255, 235, 130);
      p.triangle(0, -18, -5, -10, 5, -10);
    }

    p.pop();
  }
}
