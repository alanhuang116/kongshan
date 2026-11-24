// core.mjs 的类型（tests/net.test.ts 用；relay 本身是纯 JS，不经过编译）
export interface Proto {
  v: number;
  names: { a: string[]; b: string[] };
  robes: string[];
  phrases: Array<{ id: string; text: string; when?: string }>;
  places: string[];
  poses: string[];
  acts: Array<[string, string]>;
  bounds: { x: [number, number]; y: [number, number]; z: [number, number]; speed: number };
  near: number;
}
export const PROTO: Proto;
export const MAX_BYTES: number;
export const CLOSE: { bad: number; ver: number; full: number; busy: number; hello: number; bye: number };
export type State = [number, number, number, number, number, number, number, number, number, number];
export function readName(n: unknown): [number, number] | null;
export function readRobe(c: unknown): number | null;
export function readRoom(r: unknown): string | null;
export function readState(d: unknown, prevCt?: number): State | null;
export class Bucket {
  constructor(cap: number, rate: number, now: number);
  cap: number; rate: number; n: number; t: number;
  take(now: number, k?: number): boolean;
}
export interface Conn { send(s: string): void; close(code: number, why: string): void; buffered(): number }
export interface HubClient {
  id: number; conn: Conn; ip: string; room: HubRoom | null; name: [number, number] | null; robe: number; st: State | null;
  dirty: boolean; need: boolean; t0: number; gone: boolean; strikes: number; strikeT: number;
}
export interface HubRoom { id: string; members: Set<HubClient> }
export class Hub {
  constructor(o?: { roomSize?: number; maxConn?: number; perIp?: number; near?: number; now?: () => number; log?: (...a: unknown[]) => void });
  roomSize: number; maxConn: number; perIp: number; near: number;
  rooms: Map<string, HubRoom>;
  clients: Set<HubClient>;
  byId: Map<number, HubClient>;
  admit(ip: string): 'ok' | 'full' | 'ip';
  open(conn: Conn, ip?: string): HubClient;
  close(c: HubClient): void;
  kick(c: HubClient, code: number, why: string): void;
  message(c: HubClient, data: string | Uint8Array, isBinary?: boolean): boolean;
  pick(want: string | null): HubRoom;
  tick(): void;
  sweep(): void;
  stats(): { rooms: number; players: number; conns: number };
}
