import { ComicsDetail, ComicsReading } from '../utils/scrapers/comicsv2';
import { KomikuDetail, KomikuReading } from '../utils/scrapers/komiku';
import {
  NovelDetail as NovelDetailType,
  NovelReading as NovelReadingType,
} from '../utils/scrapers/meionovel';
import { FilmSearchItem, FilmSeason, FilmStream } from '../types/film';
import { AniDetail, AniStreaming, EpisodeBaruHome } from './anime';
import { ForumCategory, ForumLinkedMedia, ForumPost } from './forum';

type HomeNavigator = {
  HomePage: undefined;
  BrowsePage: undefined;
  ForumPage:
    | {
        filterMediaKey?: string;
        filterMediaTitle?: string;
        initialCategory?: ForumCategory;
      }
    | undefined;
  MessagesPage: undefined;
  MyListsPage: { initialTab?: 'history' | 'watchlater' | 'downloads' } | undefined;
  AccountPage: undefined;
};

type RootStackNavigator = {
  connectToServer: undefined;
  CbzReader: {
    fileUrl: string;
  };
  Home: {
    data?: EpisodeBaruHome;
    screen?: keyof HomeNavigator;
    params?: HomeNavigator[keyof HomeNavigator];
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
    seriesLink?: string;
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
    seriesLink?: string;
    historyData?: {
      resolution: string;
      lastDuration: number;
    };
    forceDetail?: boolean;
  };
  Video: {
    data: AniStreaming;
    link: string;
    thumbnailUrl?: string;
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
    type:
      | 'AnimeList'
      | 'MovieList'
      | 'ComicsList'
      | 'ComicsPopular'
      | 'ComicsManhwa'
      | 'NovelsList'
      | 'NovelsPopular'
      | 'AnimeGenre'
      | 'ComicsGenre'
      | 'FilmList'
      | 'DonghuaList';
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
    data: FilmSearchItem;
  };
  FilmPlayer: {
    streams: FilmStream[];
    title: string;
    subjectId: string;
    detailPath: string;
    type: 'movie' | 'tv';
    season?: number;
    episode?: number;
    poster?: string;
    seasons?: FilmSeason[];
    language?: string;
    source?: string;
    historyData?: { lastDuration?: number; resolution?: string };
    roomId?: string;
    isGuest?: boolean;
  };
  DMChat: {
    channelId: string;
    receiverId: string;
    username: string;
    partnerAvatar?: string | null;
    isPending?: boolean;
  };
  ErrorScreen: { error: Error };
  AnimeSchedule: undefined;
  JoinNobar: { roomId?: string; room?: string };
  ForumComposer:
    | {
        linkedMedia?: ForumLinkedMedia;
        defaultCategory?: ForumCategory;
        nobarRoomId?: string;
        nobarTitle?: string;
      }
    | undefined;
  ForumPostDetail: {
    postId: string;
    initialPost?: ForumPost;
    focusComment?: boolean;
    rootCommentId?: string;
  };
  ForumUserFeed: {
    mode: 'bookmarks' | 'user_posts';
    userId?: string;
    username?: string;
  };
  OfflineVideoPlayer: {
    item: import('./offlineAnime').OfflineAnimeItem;
  };
};

type UtilsStackNavigator = {
  ChooseScreen: undefined;
  SearchAnimeByImage: undefined;
  Changelog: undefined;
  Setting: undefined;
  About: undefined;
  SupportDev: undefined;
  ExtensionManager: undefined;
  HomePreferences: undefined;
};

type SayaDrawerNavigator = {
  History: undefined;
  WatchLater: undefined;
};

export type { HomeNavigator, RootStackNavigator, SayaDrawerNavigator, UtilsStackNavigator };
