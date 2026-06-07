declare module "spotify-preview-finder" {
  type SpotifyPreviewFinderResult = {
    success: boolean;
    results: Array<{
      previewUrls?: string[];
    }>;
  };

  const spotifyPreviewFinder: (
    songName: string,
    artistOrLimit?: string | number,
    limit?: number,
  ) => Promise<SpotifyPreviewFinderResult>;

  export = spotifyPreviewFinder;
}
