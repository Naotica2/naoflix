import * as cheerio from 'cheerio';
import { LatestComicsRelease, ComicsDetail, ComicsReading } from './comicsv2';

const BASE_URL = 'https://v5.luvyaa.co';

async function fetchPage(url: string, signal?: AbortSignal) {
  try {
    const res = await fetch(url, {
      signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.includes('Cloudflare') || text.includes('Just a moment...')) {
      throw new Error('CF');
    }
    return text;
  } catch (error: any) {
    const msg = error?.message || String(error) || '';
    if (
      msg === 'Network request failed' || 
      msg === 'Network Error' || 
      msg === 'CF' || 
      msg.includes('HTTP 4') || 
      msg.includes('HTTP 5') || 
      msg.includes('Failed to fetch') ||
      msg.toLowerCase().includes('network')
    ) {
      const { setWebViewOpen } = require('../CFBypass');
      if (setWebViewOpen) setWebViewOpen.openWebViewCF(true, url);
      throw new Error('Silahkan selesaikan captcha');
    }
    throw error;
  }
}

function cleanTitle(s: string): string {
  return s.replace(/^Komik\s+/i, '').replace(/\s+/g, ' ').trim();
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function extractFromBsx($: cheerio.CheerioAPI, elements: cheerio.Cheerio<cheerio.Element>): LatestComicsRelease[] {
  const results: LatestComicsRelease[] = [];

  elements.each((i, el) => {
    const $el = $(el);
    const a = $el.find('a').first();
    const href = a.attr('href') || '';
    const titleRaw = a.attr('title') || $el.find('.tt').text().trim() || '';
    const title = cleanTitle(titleRaw);
    
    let slug = href.replace(/\/$/, '').split('/').pop() || '';
    const detailUrl = `luvyaa://detail/${slug}`;

    let image =
      $el.find('img').attr('data-lazy-src') ||
      $el.find('img').attr('data-src') ||
      $el.find('img').attr('src') ||
      '';
    if (image.includes('?resize')) image = image.split('?')[0];

    const typeRaw = $el.find('.type').attr('class') || '';
    let type: 'Manga' | 'Manhwa' | 'Manhua' = 'Manga';
    if (typeRaw.includes('Manga')) type = 'Manga';
    else if (typeRaw.includes('Manhwa')) type = 'Manhwa';
    else if (typeRaw.includes('Manhua')) type = 'Manhua';

    const latestChapter = $el.find('.epxs').text().trim() || '';

    if (title && slug) {
      results.push({
        title,
        detailUrl,
        type,
        latestChapter,
        thumbnailUrl: image,
        concept: '',
        shortDescription: '',
        additionalInfo: '',
      });
    }
  });

  return results;
}

export async function getLatestComicsReleases(
  page: number,
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  const url = `${BASE_URL}/manga/?status=&type=&order=update&page=${page}`;
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);

  return extractFromBsx($, $('.bsx'));
}

export async function getPopularComicsReleases(
  page: number,
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  const url = `${BASE_URL}/manga/?status=&type=&order=popular&page=${page}`;
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);

  return extractFromBsx($, $('.bsx'));
}

export async function getManhwaComicsReleases(
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  const url = `${BASE_URL}/manga/?status=&type=manhwa&order=update&page=${page}`;
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);

  return extractFromBsx($, $('.bsx'));
}

export async function getComicsDetail(
  link: string,
  signal?: AbortSignal,
): Promise<ComicsDetail> {
  const slug = link.replace('luvyaa://detail/', '');
  const url = `${BASE_URL}/${slug}/`;
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);

  const rawTitle = $('h1.entry-title').text() || $('.ts-breadcrumb li[itemprop="itemListElement"]:last-child span[itemprop="name"]').text();
  const title = cleanTitle(rawTitle);
  
  let image = $('.thumb img').attr('src') || '';
  if (image.includes('?resize')) image = image.split('?')[0];

  const synopsis = $('div[itemprop="description"]').text().trim();
  
  const genres: string[] = [];
  $('.mgen a').each((i, el) => {
    genres.push($(el).text().trim());
  });

  let status = $('.status-text').text().trim() || $('.imptdt:contains("Status") i').text().trim();
  const typeStr = $('.imptdt:contains("Type") a').text().trim() || $('.imptdt:contains("Type") i').text().trim();
  let type: 'Manga' | 'Manhwa' | 'Manhua' = 'Manga';
  if (typeStr.includes('Manga')) type = 'Manga';
  else if (typeStr.includes('Manhwa')) type = 'Manhwa';
  else if (typeStr.includes('Manhua')) type = 'Manhua';

  const author = $('.meta-label:contains("Author")').next().text().trim() || $('.fmed:contains("Author") span').text().trim();
  
  const chapters: { chapter: string; chapterUrl: string; releaseDate: string; views: string }[] = [];
  
  $('#chapterlist li').each((i, el) => {
    const $a = $(el).find('a');
    const chapterUrlStr = $a.attr('href') || '';
    const chapterTitle = $(el).find('.chapternum').text().trim();
    const releaseDate = $(el).find('.chapterdate').text().trim();

    if (chapterUrlStr && chapterTitle) {
      let chapSlug = chapterUrlStr.replace(/\/$/, '').split('/').pop() || '';
      chapters.push({
        chapter: chapterTitle,
        chapterUrl: `luvyaa://chapter/${chapSlug}`,
        releaseDate,
        views: '',
      });
    }
  });

  return {
    title,
    indonesianTitle: '',
    type,
    author,
    status: status === 'Ongoing' ? 'Ongoing' : 'End',
    minAge: '',
    concept: 'Data tidak tersedia',
    readingDirection: type === 'Manga' ? 'Right to Left' : 'Top to Bottom',
    headerImageUrl: image,
    thumbnailUrl: image,
    genres,
    synopsis,
    chapters,
  };
}

export async function getComicsReading(
  link: string,
  signal?: AbortSignal,
): Promise<ComicsReading> {
  const slug = link.replace('luvyaa://chapter/', '');
  const url = `${BASE_URL}/${slug}/`;
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);

  const titleRaw = $('h1.entry-title').text();
  let title = cleanTitle(titleRaw);
  let chapter = 'Data tidak tersedia';

  const chapMatch = title.match(/(?:\s*[-–|:]?\s*)((?:Chapter|Ch\.?|Bab)\s*\d+(?:[.,]\d+)?.*)/i);
  if (chapMatch) {
    chapter = chapMatch[1].replace(/^ch\.?\s*/i, 'Chapter ').trim();
    title = title.replace(chapMatch[0], '').trim() || title;
  } else {
    const slugMatch = slug.match(/(?:chapter|ch)[-_]?(\d+(?:[-.]\d+)?)/i) || slug.match(/-(\d+(?:[-.]\d+)?)$/);
    if (slugMatch?.[1]) {
      chapter = `Chapter ${slugMatch[1].replace('-', '.')}`;
    }
  }
  
  let images: string[] = [];
  let nextChapterUrl = '';
  let prevChapterUrl = '';

  const scriptRegex = /ts_reader\.run\((.*?)\);/;
  const match = html.match(scriptRegex);
  if (match && match[1]) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.sources && parsed.sources.length > 0) {
        images = parsed.sources[0].images || [];
      }
      if (parsed.nextUrl) nextChapterUrl = parsed.nextUrl;
      if (parsed.prevUrl) prevChapterUrl = parsed.prevUrl;
    } catch (e) {
      console.error('Failed to parse ts_reader JSON', e);
    }
  }

  if (images.length === 0) {
    $('#readerarea img').each((i, el) => {
      let src = $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('src') || '';
      if (src.startsWith('//')) src = 'https:' + src;
      images.push(src);
    });
  }
  
  images = images.filter(Boolean).map(url => url.trim());

  if (!nextChapterUrl || nextChapterUrl === '#/next/') {
    nextChapterUrl = $('.nextprev a[rel="next"]').attr('href') || '';
  }
  if (!prevChapterUrl || prevChapterUrl === '#/prev/') {
    prevChapterUrl = $('.nextprev a[rel="prev"]').attr('href') || '';
  }

  if (nextChapterUrl && nextChapterUrl !== '#/next/') {
    const nSlug = nextChapterUrl.replace(/\/$/, '').split('/').pop() || '';
    nextChapterUrl = `luvyaa://chapter/${nSlug}`;
  } else nextChapterUrl = '';

  if (prevChapterUrl && prevChapterUrl !== '#/prev/') {
    const pSlug = prevChapterUrl.replace(/\/$/, '').split('/').pop() || '';
    prevChapterUrl = `luvyaa://chapter/${pSlug}`;
  } else prevChapterUrl = '';

  return {
    title,
    chapter,
    thumbnailUrl: '',
    releaseDate: '',
    comicImages: images,
    nextChapter: nextChapterUrl || undefined,
    prevChapter: prevChapterUrl || undefined,
  };
}

export async function getComicsSearch(
  query: string,
  page: number,
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  const url = `${BASE_URL}/page/${page}/?s=${encodeURIComponent(query)}`;
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);

  return extractFromBsx($, $('.bsx'));
}

const LUVYAA_RESERVED_SLUGS = new Set([
  'manga',
  'genres',
  'genre',
  'page',
  'bookmark',
  'project',
  'projects',
  'az-lists',
  'schedule',
  'blog',
  'dmca',
  'privacy-policy',
  'home',
  'wp-content',
  'wp-admin',
]);

export async function getLuvyaaDetailUrlFromChapter(
  link: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (link.startsWith('luvyaa://detail/')) return link;
  const chapSlug = link.replace('luvyaa://chapter/', '').replace(/^\/+|\/+$/g, '');
  if (!chapSlug) return null;

  const url = `${BASE_URL}/${chapSlug}/`;
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);

  const candidates: string[] = [];
  $(
    '.allc a[href], .headpost a[href], a.allc[href], .ts-breadcrumb a[href], .breadcrumb a[href]',
  ).each((_i, el) => {
    const href = $(el).attr('href');
    if (href) candidates.push(href);
  });

  for (const href of candidates) {
    if (href === '#' || /^javascript:/i.test(href)) continue;
    if (/^https?:\/\//i.test(href) && !href.toLowerCase().includes('luvyaa')) continue;
    const cleanPath = href.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
    const segs = cleanPath.split('/').filter(Boolean);
    if (segs.length === 1) {
      const slug = segs[0];
      if (slug !== chapSlug && !LUVYAA_RESERVED_SLUGS.has(slug.toLowerCase())) {
        return `luvyaa://detail/${slug}`;
      }
    }
  }
  return null;
}
