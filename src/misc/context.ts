import { Dispatch, SetStateAction, createContext } from 'react';
import { EpisodeBaruHome, NewAnimeList } from '../types/anime';
import { LatestComicsRelease } from '../utils/scrapers/comicsv2';

export const EpisodeBaruHomeContext = createContext<{
  paramsState?: EpisodeBaruHome;
  setParamsState?: Dispatch<SetStateAction<EpisodeBaruHome>>;
}>({ paramsState: undefined, setParamsState: undefined });

export const MovieListHomeContext = createContext<{
  paramsState?: NewAnimeList[];
  setParamsState?: Dispatch<SetStateAction<NewAnimeList[]>>;
}>({ paramsState: undefined, setParamsState: undefined });

export const ComicsListContext = createContext<{
  paramsState?: LatestComicsRelease[];
  setParamsState?: Dispatch<SetStateAction<LatestComicsRelease[] | undefined>>;
}>({ paramsState: undefined, setParamsState: undefined });

export const NovelListContext = createContext<{
  paramsState?: import('../utils/scrapers/meionovel').LatestNovel[];
  setParamsState?: Dispatch<SetStateAction<import('../utils/scrapers/meionovel').LatestNovel[] | undefined>>;
}>({ paramsState: undefined, setParamsState: undefined });
