// Synchronization primitives for the simulator

export class SimMutex {
  name: string;
  owner: number | null = null;
  queue: number[] = [];

  constructor(name: string) {
    this.name = name;
  }

  tryAcquire(cid: number): boolean {
    if (this.owner === null || this.owner === cid) {
      this.owner = cid;
      const idx = this.queue.indexOf(cid);
      if (idx !== -1) this.queue.splice(idx, 1);
      return true;
    }
    if (!this.queue.includes(cid)) this.queue.push(cid);
    return false;
  }

  release(cid: number): void {
    if (this.owner === cid) {
      this.owner = null;
    }
  }

  reset(): void {
    this.owner = null;
    this.queue = [];
  }
}

export class SimSemaphore {
  name: string;
  cap: number;
  inside: number[] = [];
  queue: number[] = [];
  cur: number = 0;

  constructor(name: string, cap: number) {
    this.name = name;
    this.cap = cap;
  }

  tryAcquire(cid: number): boolean {
    if (this.inside.includes(cid)) return true;
    if (this.cur < this.cap) {
      this.cur++;
      this.inside.push(cid);
      const idx = this.queue.indexOf(cid);
      if (idx !== -1) this.queue.splice(idx, 1);
      return true;
    }
    if (!this.queue.includes(cid)) this.queue.push(cid);
    return false;
  }

  release(cid: number): void {
    const idx = this.inside.indexOf(cid);
    if (idx !== -1) {
      this.inside.splice(idx, 1);
      this.cur--;
    }
    const qIdx = this.queue.indexOf(cid);
    if (qIdx !== -1) this.queue.splice(qIdx, 1);
  }

  available(): number {
    return this.cap - this.cur;
  }

  reset(): void {
    this.cur = 0;
    this.inside = [];
    this.queue = [];
  }
}

export class SimMonitor {
  name: string;
  cap: number;
  inside: number[] = [];
  queue: number[] = [];

  constructor(name: string, cap: number) {
    this.name = name;
    this.cap = cap;
  }

  tryEnter(cid: number): boolean {
    if (this.inside.includes(cid)) return true;
    if (this.inside.length < this.cap) {
      this.inside.push(cid);
      const idx = this.queue.indexOf(cid);
      if (idx !== -1) this.queue.splice(idx, 1);
      return true;
    }
    if (!this.queue.includes(cid)) this.queue.push(cid);
    return false;
  }

  exit(cid: number): void {
    const idx = this.inside.indexOf(cid);
    if (idx !== -1) this.inside.splice(idx, 1);
    const qIdx = this.queue.indexOf(cid);
    if (qIdx !== -1) this.queue.splice(qIdx, 1);
  }

  reset(): void {
    this.inside = [];
    this.queue = [];
  }
}
