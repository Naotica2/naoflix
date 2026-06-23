// Shared anime types (matches mobile)
export type AnimeEpisode = {
  title: string;
  thumbnailUrl: string;
  episode: string;
  streamingLink: string;
  releaseDate: string;
  releaseDay?: string;
};

export type AnimeSourceId = 'otakudesu' | 'animelovers';

export interface AnimeSource {
  id: AnimeSourceId;
  name: string;
  home(): Promise<AnimeEpisode[]>;
  search(query: string): Promise<AnimeEpisode[]>;
}
