const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

const WS_BASE_URL = API_BASE_URL.replace("http://", "ws://").replace(
  "https://",
  "wss://"
);

export type GameState =
  | "LOBBY"
  | "SEED_SELECTION"
  | "LISTENING"
  | "SUBMISSION"
  | "VOTING"
  | "RESULTS";

export type Player = {
  id: number;
  room_id: number;
  name: string;
  score: number;
  is_host: boolean;
  is_ready: boolean;
  is_connected: boolean;
  joined_at: number;
};

export type Room = {
  id: number;
  host_id: number;
  join_code: string;
  name: string;
  state: GameState;
  current_round: number;
  current_hot_seat_id: number | null;
  seed_song_id: number | null;
  seed_prompt: string | null;
  created_at: number;
  state_changed_at: number;
  max_players: number;
  players: Player[];
};

export type JoinRoomResponse = {
  room: Room;
  player: Player;
};

export type LeaveRoomResponse = {
  room: Room | null;
  deleted: boolean;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error ?? "Backend request failed");
  }

  return response.json();
}

export function createRoom(hostName: string) {
  return request<Room>("/rooms", {
    method: "POST",
    body: JSON.stringify({
      host_name: hostName,
      room_name: `${hostName}'s room`,
      max_players: 8,
    }),
  });
}

export function joinRoom(joinCode: string, playerName: string) {
  return request<JoinRoomResponse>("/rooms/join", {
    method: "POST",
    body: JSON.stringify({
      join_code: joinCode,
      player_name: playerName,
    }),
  });
}

export function setReady(roomId: number, playerId: number, ready: boolean) {
  return request<Room>(`/rooms/${roomId}/ready`, {
    method: "POST",
    body: JSON.stringify({
      player_id: playerId,
      ready,
    }),
  });
}

export function startRoom(roomId: number, playerId: number) {
  return request<Room>(`/rooms/${roomId}/start`, {
    method: "POST",
    body: JSON.stringify({
      player_id: playerId,
    }),
  });
}

export function leaveRoom(roomId: number, playerId: number) {
  return request<LeaveRoomResponse>(`/rooms/${roomId}/leave`, {
    method: "POST",
    body: JSON.stringify({
      player_id: playerId,
    }),
  });
}

export function makeRoomWebSocket(roomId: number) {
  return new WebSocket(`${WS_BASE_URL}/rooms/${roomId}/events`);
}