export type Player = {
  id: string;
  name: string;
  is_host: boolean;
  is_ready: boolean;
  is_hotseat: boolean;
  score: number;
};

export type Room = {
  id: string;
  join_code: string;
  max_players: number;
  total_rounds: number;
  status: string;
  players: Player[];
};
