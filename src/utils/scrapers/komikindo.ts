import * as cheerio from 'cheerio';
import cleanSynopsis from '../cleanSynopsis';
import {
  ComicsDetail,
  ComicsReading,
  ComicsSearch,
  LatestComicsRelease,
} from './comicsv2';
export const __ALIAS = 'komikindo';
const KOMIKINDO_BASE = 'https://komikindo.ch';

async function fetchPage(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function cleanTitle(s: string): string {
  return s.replace(/^Komik\s+/i, '').replace(/\s+/g, ' ').trim();
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function parseKomikindoCards($: cheerio.CheerioAPI): LatestComicsRelease[] {
  const results: LatestComicsRelease[] = [];

  $('.animepost').each((_i, el) => {
    const $el = $(el);
    const a = $el.find('a[itemprop="url"]').first().length
      ? $el.find('a[itemprop="url"]').first()
      : $el.find('a').first();
    const href = a.attr('href') || '';
    const titleRaw =
      a.attr('title') ||
      $el.find('.tt h4, .tt h3, .tt').first().text().trim() ||
      '';
    const title = cleanTitle(titleRaw);

    let slug = href.replace(/\/$/, '').split('/').pop() || '';
    if (href.includes('/komik/')) {
      slug = href.split('/komik/')[1]?.replace(/\/$/, '') || slug;
    }
    const detailUrl = `komikindo://detail/${slug}`;

    const imgEl = $el.find('img[itemprop="image"]').first().length
      ? $el.find('img[itemprop="image"]').first()
      : $el.find('img').first();
    const lazyImg = imgEl.attr('data-lazy-src') || imgEl.attr('data-src') || '';
    const srcImg = imgEl.attr('src') || '';
    let image = lazyImg || (!srcImg.startsWith('data:') ? srcImg : '');
    if (image.includes('?resize')) image = image.split('?')[0];

    const typeRaw =
      ($el.find('.typez, .typeflag').attr('class') || '') +
      ' ' +
      ($el.find('.typez, .typeflag').text() || '');
    let type: 'Manga' | 'Manhwa' | 'Manhua' = 'Manga';
    if (/manhwa/i.test(typeRaw)) type = 'Manhwa';
    else if (/manhua/i.test(typeRaw)) type = 'Manhua';
    else if (/manga/i.test(typeRaw)) type = 'Manga';

    const latestChapter = $el.find('.lsch a, .epxs').first().text().trim() || '';

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
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  const url = page === 1 ? KOMIKINDO_BASE : `${KOMIKINDO_BASE}/page/${page}/`;
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);
  return parseKomikindoCards($);
}

export async function getPopularComicsReleases(
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  const url = page <= 1 ? `${KOMIKINDO_BASE}/komik-populer/` : `${KOMIKINDO_BASE}/komik-populer/page/${page}/`;
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);
  return parseKomikindoCards($);
}

export async function getManhwaComicsReleases(
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  const url = page <= 1 ? `${KOMIKINDO_BASE}/manhwa/` : `${KOMIKINDO_BASE}/manhwa/page/${page}/`;
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);
  return parseKomikindoCards($);
}

export async function getComicsDetail(
  urlRaw: string,
  signal?: AbortSignal,
): Promise<ComicsDetail> {
  const slug = urlRaw.replace('komikindo://detail/', '').replace('komikindo://detail', '');
  if (!slug) throw new Error('Invalid komikindo detail URL');

  const url = `${KOMIKINDO_BASE}/komik/${slug}/`;
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);

  const rawTitle = $('.infoanime h1.entry-title').text();
  const title = rawTitle.replace(/^Komik\s+/i, '').replace(/\s+/g, ' ').trim();
  let image = $('.infoanime .thumb img').attr('src') || '';
  if (image.includes('?resize')) image = image.split('?')[0];

  const synopsis = cleanSynopsis($('[itemprop="description"]').text());
  
  const genres: string[] = [];
  $('.genre-info a').each((i, el) => {
    genres.push($(el).text().trim());
  });

  let author = '';
  let status: 'Ongoing' | 'End' | 'Data tidak tersedia' = 'Data tidak tersedia';
  let type: 'Manga' | 'Manhwa' | 'Manhua' = 'Manga';
  let minAge = '';
  let concept = '';
  let indonesianTitle = '';

  $('.infox .spe span').each((i, el) => {
    const text = $(el).text().trim();
    if (text.includes('Pengarang:')) author = text.replace('Pengarang:', '').trim();
    if (text.includes('Status:')) {
      const s = text.replace('Status:', '').trim().toLowerCase();
      status = s.includes('end') || s.includes('tamat') ? 'End' : 'Ongoing';
    }
    if (text.includes('Jenis Komik:')) {
      const t = text.replace('Jenis Komik:', '').trim();
      if (t.includes('Manga')) type = 'Manga';
      else if (t.includes('Manhwa')) type = 'Manhwa';
      else if (t.includes('Manhua')) type = 'Manhua';
    }
    if (text.includes('Umur Pembaca:')) minAge = text.replace('Umur Pembaca:', '').trim();
    if (text.includes('Tema:')) concept = text.replace('Tema:', '').trim();
    if (text.includes('Judul Alternatif:')) indonesianTitle = text.replace('Judul Alternatif:', '').trim();
  });

  const chapters: any[] = [];
  $('#chapter_list li').each((i, el) => {
    const $a = $(el).find('.lchx a');
    const chapterTitle = $a.text().trim();
    const chapterHref = $a.attr('href') || '';
    const chapterSlug = chapterHref.replace(/\/$/, '').split('/').pop() || '';
    const releaseDate = $(el).find('.dt a').text().trim() || $(el).find('.dt').text().trim();

    if (chapterSlug) {
      chapters.push({
        chapter: chapterTitle,
        chapterUrl: `komikindo://chapter/${chapterSlug}`,
        releaseDate,
        views: '',
      });
    }
  });

  return {
    title,
    indonesianTitle: indonesianTitle || title,
    type,
    author: author || 'Data tidak tersedia',
    status,
    minAge: minAge || 'Data tidak tersedia',
    concept: concept || 'Data tidak tersedia',
    readingDirection: 'Data tidak tersedia',
    headerImageUrl: image,
    thumbnailUrl: image,
    genres,
    synopsis,
    chapters,
  };
}

export async function getComicsReading(
  urlRaw: string,
  signal?: AbortSignal,
): Promise<ComicsReading> {
  const chapterSlug = urlRaw.replace('komikindo://chapter/', '');
  if (!chapterSlug) throw new Error('Invalid komikindo chapter URL');

  const url = `${KOMIKINDO_BASE}/${chapterSlug}/`;
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);

  const titleRaw = $('.entry-title').text();
  let title = titleRaw.replace(/^Komik\s+/i, '').replace(/\s+/g, ' ').trim();
  let chapter = 'Data tidak tersedia';

  const chapMatch = title.match(/(?:\s*[-–|:]?\s*)((?:Chapter|Ch\.?|Bab)\s*\d+(?:[.,]\d+)?.*)/i);
  if (chapMatch) {
    chapter = chapMatch[1].replace(/^ch\.?\s*/i, 'Chapter ').trim();
    title = title.replace(chapMatch[0], '').trim() || title;
  } else {
    const slugMatch = chapterSlug.match(/(?:chapter|ch)[-_]?(\d+(?:[-.]\d+)?)/i) || chapterSlug.match(/-(\d+(?:[-.]\d+)?)$/);
    if (slugMatch?.[1]) {
      chapter = `Chapter ${slugMatch[1].replace('-', '.')}`;
    }
  }
  
  const images: string[] = [];
  $('#chimg-auh img').each((i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    if (src) images.push(src);
  });

  let nextChapterUrl = '';
  let prevChapterUrl = '';
  $('.nextprev a').each((i, el) => {
    const rel = $(el).attr('rel');
    const href = $(el).attr('href') || '';
    const slug = href.replace(/\/$/, '').split('/').pop() || '';
    if (rel === 'next' && slug && href !== '#') nextChapterUrl = `komikindo://chapter/${slug}`;
    if (rel === 'prev' && slug && href !== '#') prevChapterUrl = `komikindo://chapter/${slug}`;
  });

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
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  const url = `${KOMIKINDO_BASE}/?s=${encodeURIComponent(query)}`;
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);
  return parseKomikindoCards($);
}

export async function getComicsSearchWithGenre(
  genre: string,
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestComicsRelease[]> {
  const slug = genre.toLowerCase().trim().replace(/\s+/g, '-');
  if (slug === 'manhwa') {
    return await getManhwaComicsReleases(page, signal);
  }
  const url = `${KOMIKINDO_BASE}/genres/${slug}/page/${page}/`;
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);
  return parseKomikindoCards($);
}

export async function getKomikindoDetailUrlFromChapter(
  urlRaw: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (urlRaw.startsWith('komikindo://detail/')) return urlRaw;

  let targetUrl = '';
  if (urlRaw.startsWith('komikindo://chapter/')) {
    const chapterSlug = urlRaw.replace('komikindo://chapter/', '').replace(/^\/+|\/+$/g, '');
    if (!chapterSlug) return null;
    targetUrl = `${KOMIKINDO_BASE}/${chapterSlug}/`;
  } else if (/^https?:\/\//i.test(urlRaw)) {
    const cleanPath = urlRaw.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
    const segs = cleanPath.split('/').filter(Boolean);
    if (
      segs.length === 2 &&
      segs[0].toLowerCase() === 'komik' &&
      !['page', 'hot', 'popular', 'genre', 'genres', 'daftar-komik'].includes(segs[1].toLowerCase())
    ) {
      return `komikindo://detail/${segs[1]}`;
    }
    targetUrl = urlRaw;
  } else {
    return null;
  }

  const html = await fetchPage(targetUrl, signal);
  const $ = cheerio.load(html);
  const candidates: string[] = [];
  $(
    '.allc a[href], .ts-breadcrumb a[href], .breadcrumb a[href], .nvx a[href], a[href*="/komik/"]',
  ).each((_i, el) => {
    const href = $(el).attr('href');
    if (href) candidates.push(href);
  });

  for (const href of candidates) {
    const cleanPath = href.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
    const segs = cleanPath.split('/').filter(Boolean);
    if (
      segs.length === 2 &&
      segs[0].toLowerCase() === 'komik' &&
      !['page', 'hot', 'popular', 'genre', 'genres', 'daftar-komik'].includes(segs[1].toLowerCase())
    ) {
      return `komikindo://detail/${segs[1]}`;
    }
  }
  return null;
}
