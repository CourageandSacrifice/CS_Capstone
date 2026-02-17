import { Client, Room } from '@colyseus/sdk';

const SERVER_URL = `ws://${window.location.hostname}:2567`;
const TOKEN_KEY = 'cc_reconnectionToken';

let client: Client;
let room: Room;

function initClient(): Client {
  if (!client) client = new Client(SERVER_URL);
  return client;
}

function setupRoom(r: Room): Room {
  room = r;
  console.log('Connected to room', room.roomId);
  console.log('Session ID:', room.sessionId);

  // Store reconnection token for page refresh recovery
  sessionStorage.setItem(TOKEN_KEY, room.reconnectionToken);

  room.onLeave((code) => {
    console.log('Left room. Code:', code);
    // Code 1000 = normal close (intentional leave)
    if (code === 1000) {
      clearReconnectionData();
    }
  });

  room.onError((code, message) => {
    console.error('Room error:', code, message);
  });

  return room;
}

export async function autoJoin(name: string): Promise<Room> {
  const c = initClient();
  const r = await c.joinOrCreate('my_room', { name });
  return setupRoom(r);
}

export async function createRoom(name: string): Promise<Room> {
  const c = initClient();
  const r = await c.create('my_room', { name });
  return setupRoom(r);
}

export async function joinRoom(roomId: string, name: string): Promise<Room> {
  const c = initClient();
  const r = await c.joinById(roomId, { name });
  return setupRoom(r);
}

export async function reconnect(): Promise<Room> {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) throw new Error('No reconnection token found');

  const c = initClient();
  try {
    const r = await c.reconnect(token);
    return setupRoom(r);
  } catch (err) {
    clearReconnectionData();
    throw err;
  }
}

export function hasReconnectionToken(): boolean {
  return !!sessionStorage.getItem(TOKEN_KEY);
}

export function clearReconnectionData(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function getRoom(): Room | undefined {
  return room;
}

export async function joinAnyRoom(name: string): Promise<Room> {
  const c = initClient();
  const r = await c.join('my_room', { name });
  return setupRoom(r);
}

export function sendPosition(x: number, y: number): void {
  if (!room) return;
  room.send('move', { x, y });
}

export function sendAttack(targetId: string): void {
  if (!room) return;
  room.send('attack', { targetId });
}
