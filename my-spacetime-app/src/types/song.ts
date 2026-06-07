export type Song = {
  title: string;
  artist: string;
  album: string;
  albumCover: string | null;
  releaseDate: string;
  durationMs: number;
  spotifyUrl: string;
  previewUrl: string | null;
};

export type SongSearchResponse = {
  success: boolean;
  song?: Song;
  error?: string;
};
