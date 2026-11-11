export type FilmSearchItem = {
  id: string;
  title: string;
  poster: string;
  type: string; // "Movie" or "TV"
  quality?: string;
  rating?: string;
  year?: string;
  genres?: string[];
  status?: string;
  source: string;

  // Legacy fields to support existing UI without rewrite
  subjectType?: number | string;
  genre?: string;
  imdbRatingValue?: string | number;
  releaseDate?: string;
  countryName?: string;
  description?: string;
  subtitles?: any[];
  cover?: string;
};

export type FilmStream = {
  id: string;
  url: string; // iframe URL
  headers?: Record<string, string>;
  resolutions?: string;
  codecName?: string;
};

export type FilmSeason = {
  seasonNumber: number;
  episodes: number[];

  // Legacy fields
  se?: number;
  maxEp?: number;
};

export type FilmCaption = {
  language: string;
  url: string;
};
