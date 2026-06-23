import cheerio from 'cheerio';
import deviceUserAgent from '../deviceUserAgent';

export const __ALIAS = 'mynimeku';
export const DOMAIN = 'www.mynimeku.com';
const BASE_URL = `https://${DOMAIN}`;

function normalizeUrl(url: string | undefined): string {
  if (!url || url === '') return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${BASE_URL}${url}`;
  return `${BASE_URL}/${url}`;
}

async function fetchPage(url: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': deviceUserAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.text();
}

// ============ LATEST RELEASES ============
export interface MynimekuRelease {
  title: string;
  thumbnailUrl: string;
  detailUrl: string;
  type: 'Manga' | 'Manhwa' | 'Manhua';
  latestChapter: string;
  concept: string;
  shortDescription: string;
  additionalInfo: string;
}

export async function getLatestMynimekuReleases(
  page: number = 1,
  signal?: AbortSignal,
): Promise<MynimekuRelease[]> {
  const url = page <= 1
    ? `${BASE_URL}/latest-komik/`
    : `${BASE_URL}/latest-komik/page/${page}/`;

  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);
  const items: MynimekuRelease[] = [];

  $('article.mynimeku-update-feed__item').each((_i, el) => {
    const $el = $(el);
    const coverLink = $el.find('a.mynimeku-update-feed__cover');
    const detailUrl = coverLink.attr('href') || '';
    const imgEl = coverLink.find('img');
    const thumbnailUrl = normalizeUrl(imgEl.attr('data-lazy-src') || imgEl.attr('data-src') || imgEl.attr('src') || '');
    const title = $el.find('a.mynimeku-update-feed__series-title').text().trim();

    // Type badge is the first badge, status is the second
    const badges = $el.find('span.mynimeku-update-feed__badge');
    const typeRaw = badges.eq(0).text().trim().toUpperCase();
    const status = badges.eq(1).text().trim();
    const type = (typeRaw.includes('MANHWA') ? 'Manhwa'
      : typeRaw.includes('MANHUA') ? 'Manhua'
        : 'Manga') as MynimekuRelease['type'];

    // Chapter from the latest pill
    const latestChapter = $el.find('span.mynimeku-update-feed__latest-pill').attr('title')?.replace(/Chapter\s*/i, '') || '';

    if (title && detailUrl) {
      items.push({
        title,
        thumbnailUrl,
        detailUrl: normalizeUrl(detailUrl),
        type,
        latestChapter: latestChapter || '?',
        concept: status,
        shortDescription: '',
        additionalInfo: type,
      });
    }
  });

  return items;
}

// ============ DETAIL PAGE ============
export interface MynimekuDetail {
  title: string;
  indonesianTitle: string;
  type: 'Manga' | 'Manhwa' | 'Manhua' | 'Data tidak tersedia';
  author: string;
  status: 'Ongoing' | 'End' | 'Data tidak tersedia';
  minAge: string;
  concept: string;
  readingDirection: string;
  headerImageUrl: string;
  thumbnailUrl: string;
  genres: string[];
  synopsis: string;
  chapters: {
    chapter: string;
    chapterUrl: string;
    releaseDate: string;
    views: string;
  }[];
}

export async function getMynimekuDetailFromUrl(
  detailUrl: string,
  signal?: AbortSignal,
): Promise<MynimekuDetail> {
  const html = await fetchPage(detailUrl, signal);
  const $ = cheerio.load(html);

  // Title
  const title = $('h1.komik-series-hero__title').first().text().trim();
  const indonesianTitle = title;

  // Thumbnail
  const coverImg = $('div.komik-series-hero__cover img').first();
  const thumbnailUrl = normalizeUrl(
    coverImg.attr('data-lazy-src')
    || coverImg.attr('data-src')
    || coverImg.attr('src')
    || $('meta[property="og:image"]').attr('content')
    || '',
  );
  const headerImageUrl = thumbnailUrl;

  // Info table
  const infoRows: Record<string, string> = {};
  $('table.komik-series-table tr').each((_i, el) => {
    const th = $(el).find('th').text().trim().replace(/:$/, '').toLowerCase();
    const td = $(el).find('td').text().trim();
    if (th && td) infoRows[th] = td;
  });

  const typeRaw = (infoRows['type'] || '').toUpperCase();
  const type = (typeRaw.includes('MANHWA') ? 'Manhwa'
    : typeRaw.includes('MANHUA') ? 'Manhua'
      : typeRaw ? 'Manga'
        : 'Data tidak tersedia') as MynimekuDetail['type'];

  const statusRaw = (infoRows['status'] || '').toLowerCase();
  const status = (statusRaw.includes('on-going') || statusRaw.includes('ongoing')
    ? 'Ongoing'
    : statusRaw.includes('completed') || statusRaw.includes('end')
      ? 'End'
      : 'Data tidak tersedia') as MynimekuDetail['status'];

  const author = infoRows['author'] || 'Data tidak tersedia';
  const minAge = infoRows['rating'] || '';
  const concept = '';
  const readingDirection = type === 'Manhwa' || type === 'Manhua' ? 'Kiri ke Kanan' : 'Kanan ke Kiri';

  // Genres
  const genres: string[] = [];
  $('span.komik-series-taxonomy__terms a[href*="/genre/"]').each((_i, el) => {
    const g = $(el).text().trim();
    if (g) genres.push(g);
  });

  // Synopsis
  const synopsis = $('div.komik-series-hero__synopsis div.komik-series-entry').text().trim();

  // Chapters
  const chapters: MynimekuDetail['chapters'] = [];
  $('div.komik-series-chapter-row').each((_i, el) => {
    const $row = $(el);
    const chapterLink = $row.find('a.komik-series-chapter-item[href*="/chapter/"]');
    const chapterUrl = chapterLink.attr('href') || '';
    const chapterNum = $row.find('span.komik-series-chapter-item__num').text().trim();
    const releaseDate = $row.find('span.komik-series-chapter-item__date').text().trim();

    if (chapterUrl) {
      chapters.push({
        chapter: chapterNum ? `Chapter ${chapterNum}` : '',
        chapterUrl: normalizeUrl(chapterUrl),
        releaseDate,
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
    minAge,
    concept,
    readingDirection,
    headerImageUrl,
    thumbnailUrl,
    genres,
    synopsis,
    chapters,
  };
}

// ============ READING PAGE ============
export interface MynimekuReading {
  title: string;
  chapter: string;
  thumbnailUrl: string;
  releaseDate: string;
  comicImages: string[];
  nextChapter: string | undefined;
  prevChapter: string | undefined;
}

export async function getMynimekuReading(
  chapterUrl: string,
  signal?: AbortSignal,
): Promise<MynimekuReading> {
  const html = await fetchPage(chapterUrl, signal);
  const $ = cheerio.load(html);

  // Title
  const fullTitle = $('h1.post-title.entry-title, div.entry-hero h1').first().text().trim();
  const title = fullTitle
    .replace(/ Chapter \d+.*/i, '')
    .replace(/ Bahasa Indonesia$/i, '');

  const chapMatch = fullTitle.match(/Chapter\s*\d+(\.\d+)?/i);
  const chapter = chapMatch ? chapMatch[0] : fullTitle;

  // Thumbnail
  const thumbnailUrl = normalizeUrl($('meta[property="og:image"]').attr('content') || '');

  // Release date - not directly available, use empty string
  const releaseDate = '';

  // Comic images from reader content
  const comicImages: string[] = [];
  $('div.komik-reader-content img').each((_i, el) => {
    const src = $(el).attr('data-lazy-src') || $(el).attr('data-src') || $(el).attr('src') || '';
    if (src && !src.includes('emoji') && !src.includes('icon') && !src.startsWith('data:image/')) {
      comicImages.push(normalizeUrl(src));
    }
  });

  // Navigation
  const prevLink = $('a.komik-chapter-nav__control--prev').first().attr('href') || '';
  const nextLink = $('a.komik-chapter-nav__control--next').first().attr('href') || '';

  return {
    title,
    chapter,
    thumbnailUrl,
    releaseDate,
    comicImages,
    prevChapter: prevLink ? normalizeUrl(prevLink) : undefined,
    nextChapter: nextLink ? normalizeUrl(nextLink) : undefined,
  };
}

// ============ SEARCH ============
export interface MynimekuSearch {
  title: string;
  thumbnailUrl: string;
  detailUrl: string;
  type: 'Manga' | 'Manhwa' | 'Manhua';
  latestChapter: string;
  concept: string;
  additionalInfo: string;
}

export async function mynimekuSearch(
  query: string,
  signal?: AbortSignal,
): Promise<MynimekuSearch[]> {
  // Use ?s= parameter format (site redirects to /search/slug/)
  const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(query)}&post_type=komik`;

  const html = await fetchPage(searchUrl, signal);
  const $ = cheerio.load(html);
  const results: MynimekuSearch[] = [];

  $('article.mynimeku-search-feed__item').each((_i, el) => {
    const $el = $(el);
    const coverLink = $el.find('a.mynimeku-search-feed__cover');
    const detailUrl = coverLink.attr('href') || '';
    const imgEl = coverLink.find('img');
    const thumbnailUrl = normalizeUrl(imgEl.attr('data-lazy-src') || imgEl.attr('data-src') || imgEl.attr('src') || '');
    const title = $el.find('a.mynimeku-search-feed__series-title').text().trim();

    // Only include komik results (URL contains /komik/)
    if (!detailUrl.includes('/komik/')) return;

    const typeRaw = $el.find('span.mynimeku-search-feed__type').text().trim().toUpperCase();
    const status = $el.find('span.mynimeku-search-feed__status').text().trim();
    const type = (typeRaw.includes('MANHWA') ? 'Manhwa'
      : typeRaw.includes('MANHUA') ? 'Manhua'
        : 'Manga') as MynimekuSearch['type'];
    const synopsis = $el.find('p.mynimeku-search-feed__synopsis').text().trim();

    if (title && detailUrl) {
      results.push({
        title,
        thumbnailUrl,
        detailUrl: normalizeUrl(detailUrl),
        type,
        latestChapter: '?',
        concept: status,
        additionalInfo: synopsis.slice(0, 100),
      });
    }
  });

  return results;
}

// ============ GENRE ============
export async function getMynimekuByGenre(
  genre: string,
  page: number = 1,
  signal?: AbortSignal,
): Promise<MynimekuRelease[]> {
  const url = page <= 1
    ? `${BASE_URL}/genre/${genre}/`
    : `${BASE_URL}/genre/${genre}/page/${page}/`;

  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);
  const items: MynimekuRelease[] = [];

  // Genre pages use mynimeku-taxmix-feed selectors
  $('article.mynimeku-taxmix-feed__item').each((_i, el) => {
    const $el = $(el);
    const coverLink = $el.find('a.mynimeku-taxmix-feed__cover');
    const detailUrl = coverLink.attr('href') || '';

    // Only include komik items (URL contains /komik/)
    if (!detailUrl.includes('/komik/')) return;

    const imgEl = coverLink.find('img');
    const thumbnailUrl = normalizeUrl(imgEl.attr('data-lazy-src') || imgEl.attr('data-src') || imgEl.attr('src') || '');
    const title = $el.find('a.mynimeku-taxmix-feed__series-title').text().trim();

    const typeRaw = $el.find('span.mynimeku-taxmix-feed__type').text().trim().toUpperCase();
    const type = (typeRaw.includes('MANHWA') ? 'Manhwa'
      : typeRaw.includes('MANHUA') ? 'Manhua'
        : 'Manga') as MynimekuRelease['type'];

    const status = $el.find('span.mynimeku-taxmix-feed__status').text().trim();

    if (title && detailUrl) {
      items.push({
        title,
        thumbnailUrl,
        detailUrl: normalizeUrl(detailUrl),
        type,
        latestChapter: '?',
        concept: status,
        shortDescription: '',
        additionalInfo: type,
      });
    }
  });

  return items;
}
