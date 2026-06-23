import cheerio from 'cheerio';
import { ToastAndroid } from 'react-native';
import deviceUserAgent from '../deviceUserAgent';

export const __ALIAS = 'manhwaindo';
export const DOMAIN = 'manhwaindo.my';
const BASE_URL = `https://www.${DOMAIN}`;

function normalizeUrl(url: string | undefined): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

async function fetchWithTimeout(urlPath: string, options: any = {}): Promise<string> {
  let fullUrl = urlPath;
  try {
    if (urlPath.startsWith('http')) {
      const parsedUrl = new URL(urlPath);
      fullUrl = `https://www.${DOMAIN}${parsedUrl.pathname}${parsedUrl.search}`;
    } else {
      fullUrl = `${BASE_URL}${urlPath.startsWith('/') ? '' : '/'}${urlPath}`;
    }
  } catch (e) {
    fullUrl = urlPath.startsWith('http') ? urlPath : `${BASE_URL}${urlPath.startsWith('/') ? '' : '/'}${urlPath}`;
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  
  try {
    const response = await fetch(fullUrl, {
      ...options,
      signal: options.signal ? (options.signal.aborted ? options.signal : controller.signal) : controller.signal,
      headers: {
        'User-Agent': deviceUserAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
        'Referer': BASE_URL,
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    if (response.status === 403 || response.status === 503) {
      const { setWebViewOpen } = require('../CFBypass');
      if (setWebViewOpen) setWebViewOpen.openWebViewCF(true, fullUrl);
      throw new Error('Silahkan selesaikan captcha');
    }

    if (response.ok) {
      const text = await response.text();
      if (
        text.toLowerCase().includes('just a moment...') ||
        text.includes('challenge-platform') ||
        text.includes('cf-browser-verification')
      ) {
        const { setWebViewOpen } = require('../CFBypass');
        if (setWebViewOpen) setWebViewOpen.openWebViewCF(true, fullUrl);
        throw new Error('Silahkan selesaikan captcha');
      }
      return text;
    }
    throw new Error(`Status ${response.status} on ManhwaIndo`);
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

export interface LatestManhwaIndoRelease {
  title: string;
  thumbnailUrl: string;
  detailUrl: string;
  type: 'Manga' | 'Manhwa' | 'Manhua';
  latestChapter: string;
  concept: string;
  shortDescription: string;
  additionalInfo: string;
}

export interface ManhwaIndoDetail {
  title: string;
  indonesianTitle: string;
  type: 'Manga' | 'Manhwa' | 'Manhua';
  author: string | null;
  status: 'Ongoing' | 'Tamat';
  concept: string;
  thumbnailUrl: string;
  headerImageUrl: string;
  minAge: string;
  readingDirection: string;
  genres: string[];
  synopsis: string;
  chapters: {
    chapter: string;
    chapterUrl: string;
    releaseDate: string;
    views: string;
  }[];
}

export interface ManhwaIndoReading {
  title: string;
  chapter: string;
  thumbnailUrl: string;
  comicImages: string[];
  nextChapter: string | undefined;
  prevChapter: string | undefined;
}

export interface ManhwaIndoSearch {
  title: string;
  thumbnailUrl: string;
  detailUrl: string;
  type: 'Manga' | 'Manhwa' | 'Manhua';
  latestChapter: string;
  concept: string;
  additionalInfo: string;
}

function extractThumbnailUrl($el: any): string {
  const img = $el.find('img');
  // Handle lazy loading attributes gracefully
  const src = img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src') || '';
  if (src.includes('data:image')) {
    // If it's a placeholder base64, try to find another attribute
    return img.attr('data-src') || img.attr('src') || '';
  }
  return src;
}

export async function getLatestManhwaIndoReleases(
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestManhwaIndoRelease[]> {
  const path = page === 1 ? '/' : `/page/${page}/`;
  const data = await fetchWithTimeout(path, { signal });
  const $ = cheerio.load(data);
  const results: LatestManhwaIndoRelease[] = [];

  $('.bs').each((i, el) => {
    const $el = $(el);
    const title = $el.find('.tt').text().trim() || $el.find('h2').text().trim() || $el.find('h3').text().trim() || $el.attr('title') || '';
    const detailUrl = $el.find('a').attr('href') || '';
    
    // Very important to prevent thumbnail error: 
    const thumbnailUrl = extractThumbnailUrl($el);
    
    const typeText = $el.find('span.type').text().trim().toLowerCase() || $el.find('.type').text().trim().toLowerCase();
    let type: 'Manga' | 'Manhwa' | 'Manhua' = 'Manga';
    if (typeText.includes('manhwa')) type = 'Manhwa';
    else if (typeText.includes('manhua')) type = 'Manhua';

    const latestChapter = $el.find('.epxs').text().trim() || $el.find('.epx').text().trim();

    if (title && detailUrl) {
      results.push({
        title,
        thumbnailUrl: normalizeUrl(thumbnailUrl),
        detailUrl: normalizeUrl(detailUrl),
        type,
        latestChapter,
        concept: type,
        shortDescription: '',
        additionalInfo: '',
      });
    }
  });

  if (results.length === 0) {
    throw new Error('Gagal memuat data dari ManhwaIndo (Kosong)');
  }

  return results;
}

export async function getManhwaIndoDetailFromUrl(
  url: string,
  signal?: AbortSignal,
): Promise<ManhwaIndoDetail> {
  const data = await fetchWithTimeout(url, { signal });
  const $ = cheerio.load(data);

  const title = $('.entry-title').text().trim();
  const indonesianTitle = $('.alternative').text().trim() || $('.nhtrue').text().trim();
  const synopsis = $('.entry-content p').text().trim() || $('div[itemprop="description"] p').text().trim() || $('.entry-content').text().trim();
  
  const thumbnailUrl = extractThumbnailUrl($('.thumb'));
  
  let type: 'Manga' | 'Manhwa' | 'Manhua' = 'Manga';
  let author: string | null = null;
  let statusText = 'ongoing';
  let concept = '';

  $('.tsinfo .imptdt, .infotable tr').each((i, el) => {
    const text = $(el).text().toLowerCase();
    if (text.includes('type')) {
      if (text.includes('manhwa')) type = 'Manhwa';
      else if (text.includes('manhua')) type = 'Manhua';
    }
    if (text.includes('author')) {
      author = $(el).find('i').text().trim() || $(el).text().replace(/author/i, '').trim() || null;
    }
    if (text.includes('status')) {
      statusText = $(el).text();
    }
  });

  const status = statusText.toLowerCase().includes('ongoing') ? 'Ongoing' : 'Tamat';

  const genres: string[] = [];
  $('.mgen a, .genres a').each((i, el) => {
    genres.push($(el).text().trim());
  });
  
  concept = genres.join(', ');

  const chapters: { chapter: string; chapterUrl: string; releaseDate: string; views: string }[] = [];
  $('#chapterlist ul li').each((i, el) => {
    const $el = $(el);
    const chapterTitle = $el.find('.chapternum').text().trim() || $el.find('.lchx a').text().trim() || $el.find('a').text().trim();
    const chapterUrl = $el.find('a').attr('href') || '';
    if (chapterTitle && chapterUrl) {
      const dateText = $el.find('.chapterdate').text().trim() || '';
      chapters.push({
        chapter: chapterTitle,
        chapterUrl: normalizeUrl(chapterUrl),
        releaseDate: dateText,
        views: '',
      });
    }
  });

  return {
    title,
    indonesianTitle,
    type,
    author,
    status,
    concept,
    thumbnailUrl: normalizeUrl(thumbnailUrl),
    headerImageUrl: normalizeUrl(thumbnailUrl),
    minAge: 'All Ages',
    readingDirection: 'Kanan ke Kiri',
    genres,
    synopsis,
    chapters,
  };
}

export async function getManhwaIndoReading(url: string, signal?: AbortSignal): Promise<ManhwaIndoReading> {
  const data = await fetchWithTimeout(url, { signal });
  const $ = cheerio.load(data);

  const titleMeta = $('.entry-title').text().trim() || $('.chapter_headpost h1').text().trim();
  let title = titleMeta;
  let chapter = '';
  const match = titleMeta.match(/(.*?)\s+Chapter\s+(\d+)/i) || titleMeta.match(/(.*?)\s+chapter\s+(\d+)/i);
  if (match) {
    title = match[1].trim();
    chapter = `Chapter ${match[2]}`;
  } else {
    chapter = titleMeta;
  }

  const comicImages: string[] = [];
  $('#readerarea img').each((i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
    if (src && !src.includes('clear.png') && !src.includes('banner')) {
      comicImages.push(normalizeUrl(src.trim()));
    }
  });

  const prevChapter = $('.nextprev a[rel="prev"]').attr('href') || $('.ch-prev-btn').attr('href');
  const nextChapter = $('.nextprev a[rel="next"]').attr('href') || $('.ch-next-btn').attr('href');

  return {
    title,
    chapter,
    thumbnailUrl: '', // Fetched in UI
    comicImages,
    nextChapter: nextChapter && nextChapter !== '#' ? normalizeUrl(nextChapter) : undefined,
    prevChapter: prevChapter && prevChapter !== '#' ? normalizeUrl(prevChapter) : undefined,
  };
}

export async function manhwaIndoSearch(query: string, signal?: AbortSignal): Promise<ManhwaIndoSearch[]> {
  const path = `/?s=${encodeURIComponent(query)}`;
  const data = await fetchWithTimeout(path, { signal });
  const $ = cheerio.load(data);
  const results: ManhwaIndoSearch[] = [];

  $('.bs').each((i, el) => {
    const $el = $(el);
    const title = $el.find('.tt').text().trim() || $el.find('h2').text().trim() || $el.find('h3').text().trim() || $el.attr('title') || '';
    const detailUrl = $el.find('a').attr('href') || '';
    
    const thumbnailUrl = extractThumbnailUrl($el);
    
    const typeText = $el.find('span.type').text().trim().toLowerCase() || $el.find('.type').text().trim().toLowerCase();
    let type: 'Manga' | 'Manhwa' | 'Manhua' = 'Manga';
    if (typeText.includes('manhwa')) type = 'Manhwa';
    else if (typeText.includes('manhua')) type = 'Manhua';

    const latestChapter = $el.find('.epxs').text().trim() || $el.find('.epx').text().trim();
    const rating = $el.find('.numscore').text().trim() || $el.find('.rating').text().trim();

    if (title && detailUrl) {
      results.push({
        title,
        thumbnailUrl: normalizeUrl(thumbnailUrl),
        detailUrl: normalizeUrl(detailUrl),
        type,
        latestChapter,
        concept: 'Unknown',
        additionalInfo: rating ? `Rating: ${rating}` : '',
      });
    }
  });

  // Search can naturally return empty if not found, but if we need it:
  return results;
}
