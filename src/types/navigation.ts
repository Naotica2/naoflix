import { ComicsDetail, ComicsReading } from '../utils/scrapers/comicsv2';
import { KomikuDetail, KomikuReading } from '../utils/scrapers/komiku';
import { NovelDetail as NovelDetailType, NovelReading as NovelReadingType } from '../utils/scrapers/meionovel';
import { MovieboxSearchItem, MovieboxSeason, MovieboxStream } from '../utils/scrapers/moviebox';
import { AniDetail, AniStreaming, EpisodeBaruHome } from './anime';

type HomeNavigator = {
  HomePage: undefined;
  BrowsePage: undefined;
  MessagesPage: undefined;
  MyListsPage: undefined;
  AccountPage: undefined;
};

type RootStackNavigator = {
  connectToServer: undefined;
  CbzReader: {
    fileUrl: string;
  };
  Home: {
    data: EpisodeBaruHome;
  };
  AnimeDetail: {
    data: AniDetail;
    link: string;
  };
  ComicsDetail: {
    data: KomikuDetail | ComicsDetail;
    link: string;
  };
  ComicsReading: {
    data: KomikuReading | ComicsReading;
    link: string;
    historyData: {
      lastDuration?: number;
    };
    title?: string;
    thumbnailUrl?: string;
  };
  NovelDetail: {
    data: NovelDetailType;
    link: string;
  };
  NovelReading: {
    data: NovelReadingType;
    link: string;
    historyData?: {
      lastParagraph?: number;
    };
  };
  FromUrl: {
    link: string;
    title: string;
    type?: 'comics' | 'anime' | 'novel' | 'movie';
    thumbnailUrl?: string;
    synopsis?: string;
    historyData?: {
      resolution: string;
      lastDuration: number;
    };
  };
  Video: {
    data: AniStreaming;
    link: string;
    historyData?: {
      resolution: string | undefined;
      lastDuration: number;
    };
    roomId?: string;
  };
  NeedUpdate:
    | {
        nativeUpdate: true;
        latestVersion: string;
        changelog: string;
        download: string;
      }
    | {
        nativeUpdate: false;
        changelog: string;
        size: number;
      };
  Blocked: {
    title: string;
    url: string;
    data: AniDetail | KomikuDetail;
  };
  FailedToConnect: undefined;
  Maintenance: {
    message?: string;
  };
  SeeMore: {
    type: 'AnimeList' | 'MovieList' | 'ComicsList' | 'ComicsPopular' | 'NovelsList' | 'NovelsPopular' | 'AnimeGenre' | 'ComicsGenre' | 'FilmList';
    genre?: string;
  };
  GenreSelectionScreen: {
    type: 'anime' | 'comics';
  };
  Utils: { screen?: keyof UtilsStackNavigator } | undefined;
  LoginScreen: undefined;
  UsernameSetupScreen: undefined;
  EditProfile: undefined;
  UserProfile: { userId: string };
  SearchUsers: undefined;
  FollowList: { userId: string; initialTab: 'Followers' | 'Following' };
  FilmDetail: {
    data: MovieboxSearchItem;
  };
  FilmPlayer: {
    streams: MovieboxStream[];
    title: string;
    subjectId: string;
    detailPath: string;
    type: 'movie' | 'tv';
    season?: number;
    episode?: number;
    poster?: string;
    seasons?: MovieboxSeason[];
    language?: string;
    historyData?: { lastDuration?: number; resolution?: string };
  };
  DMChat: {
    channelId: string;
    receiverId: string;
    username: string;
    isPending?: boolean;
  };
  ErrorScreen: { error: Error };
  JoinNobar: { roomId: string };
};

type UtilsStackNavigator = {
  ChooseScreen: undefined;
  SearchAnimeByImage: undefined;
  Changelog: undefined;
  Setting: undefined;
  About: undefined;
  SupportDev: undefined;
  ExtensionManager: undefined;
};

type SayaDrawerNavigator = {
  History: undefined;
  WatchLater: undefined;
};

export type { HomeNavigator, RootStackNavigator, SayaDrawerNavigator, UtilsStackNavigator };
