// Types for the Concurrency Simulator

export type CarState =
  | 'RUN'
  | 'WAIT'
  | 'WAIT_MUTEX'
  | 'WAIT_SEM'
  | 'WAIT_MON'
  | 'IN_CS'
  | 'PARKED'
  | 'DEADLOCK'
  | 'RACE_ERR';

export interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export const COLORS = {
  BG: { r: 30, g: 32, b: 40 },
  ROAD: { r: 60, g: 65, b: 75 },
  LANE_LINE: { r: 255, g: 220, b: 80, a: 90 },
  C_RUN: { r: 80, g: 180, b: 255 },
  C_WAIT: { r: 255, g: 200, b: 50 },
  C_IN_CS: { r: 50, g: 220, b: 110 },
  C_ERROR: { r: 255, g: 60, b: 60 },
  C_DEAD: { r: 170, g: 50, b: 220 },
  C_PARKED: { r: 50, g: 200, b: 100 },
  C_SELECT: { r: 255, g: 255, b: 255 },
  PANEL_BG: { r: 20, g: 22, b: 28, a: 210 },
  GRASS: { r: 72, g: 120, b: 72 },
  SIDEWALK: { r: 112, g: 116, b: 124 },
  CURB: { r: 150, g: 155, b: 160 },
  WATER: { r: 40, g: 96, b: 155 },
};

export const W = 1200;
export const H = 700;

export type PolicyName = 'FIFO' | 'SJF' | 'Round Robin';

export interface InstructionData {
  title: string;
  subtitle: string;
  bg: Color;
  accent: Color;
  lines: string[];
}
