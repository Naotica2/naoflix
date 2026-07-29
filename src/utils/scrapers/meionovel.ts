import cheerio from 'cheerio';
import deviceUserAgent from '../deviceUserAgent';

export const __ALIAS = 'meionovel';
export const DOMAIN = 'meionovels.com';
const BASE_URL = `https://${DOMAIN}`;

function normalizeUrl(url: string | undefined): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

async function fetchPage(url: string, signal?: AbortSignal): Promise<string> {
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onAbort);

  try {
    const response = await fetch(fullUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': deviceUserAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
        'Referer': BASE_URL,
      },
    });
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onAbort);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } catch (e) {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onAbort);
    throw e;
  }
}

async function fetchPagePost(url: string, signal?: AbortSignal): Promise<string> {
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onAbort);

  try {
    const response = await fetch(fullUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'User-Agent': deviceUserAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
        'Referer': BASE_URL,
      },
    });
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onAbort);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } catch (e) {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onAbort);
    throw e;
  }
}


export interface LatestNovel {
  title: string;
  thumbnailUrl: string;
  detailUrl: string;
  latestChapter: string;
  rating: string;
}

export interface NovelDetail {
  title: string;
  alternativeTitle: string;
  thumbnailUrl: string;
  synopsis: string;
  genres: string[];
  status: string;
  author: string;
  rating: string;
  chapters: {
    chapter: string;
    chapterUrl: string;
    releaseDate: string;
  }[];
}

export interface NovelReading {
  title: string;
  chapter: string;
  thumbnailUrl: string;
  content: string[]; // Array of paragraphs
  nextChapter: string | undefined;
  prevChapter: string | undefined;
}

export interface NovelSearch {
  title: string;
  thumbnailUrl: string;
  detailUrl: string;
  latestChapter: string;
  genres: string[];
  rating: string;
}


export async function getLatestNovels(
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestNovel[]> {
  const path = page === 1 ? '/' : `/page/${page}/`;
  const html = await fetchPage(path, signal);
  const $ = cheerio.load(html);
  const results: LatestNovel[] = [];

  $('.page-item-detail').each((_i, el) => {
    const $el = $(el);
    const title = $el.find('.post-title a').text().trim();
    const detailUrl = $el.find('.post-title a').attr('href') || '';
    const thumbnailUrl = $el.find('.img-responsive').attr('data-src')
      || $el.find('.img-responsive').attr('src')
      || '';
    const latestChapter = $el.find('.chapter a').first().text().trim();
    const rating = $el.find('.score').text().trim();

    if (title && detailUrl) {
      results.push({
        title,
        thumbnailUrl: normalizeUrl(thumbnailUrl),
        detailUrl: normalizeUrl(detailUrl),
        latestChapter,
        rating,
      });
    }
  });

  return results;
}

export async function getPopularNovels(
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestNovel[]> {
  const path = page === 1
    ? '/novel/?m_orderby=trending'
    : `/novel/page/${page}/?m_orderby=trending`;
  const html = await fetchPage(path, signal);
  const $ = cheerio.load(html);
  const results: LatestNovel[] = [];

  $('.page-item-detail').each((_i, el) => {
    const $el = $(el);
    const title = $el.find('.post-title a').text().trim();
    const detailUrl = $el.find('.post-title a').attr('href') || '';
    const thumbnailUrl = $el.find('.img-responsive').attr('data-src')
      || $el.find('.img-responsive').attr('src')
      || '';
    const latestChapter = $el.find('.chapter a').first().text().trim();
    const rating = $el.find('.score').text().trim();

    if (title && detailUrl) {
      results.push({
        title,
        thumbnailUrl: normalizeUrl(thumbnailUrl),
        detailUrl: normalizeUrl(detailUrl),
        latestChapter,
        rating,
      });
    }
  });

  return results;
}

export async function getNovelDetail(
  url: string,
  signal?: AbortSignal,
): Promise<NovelDetail> {
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);

  const title = $('.post-title h1').text().trim();
  const alternativeTitle = $('.post-content_item:contains("Alternative") .summary-content').text().trim()
    || $('.post-content_item:contains("Alternatif") .summary-content').text().trim()
    || '';
  const thumbnailUrl = $('.summary_image img').attr('data-src')
    || $('.summary_image img').attr('src')
    || '';
  const synopsis = $('.summary__content p').map((_i, el) => $(el).text().trim()).toArray().join('\n');
  
  const genres: string[] = [];
  $('.genres-content a').each((_i, el) => {
    genres.push($(el).text().trim());
  });

  let status = '';
  let author = '';
  $('.post-content_item').each((_i, el) => {
    const label = $(el).find('.summary-heading').text().trim().toLowerCase();
    const value = $(el).find('.summary-content').text().trim();
    if (label.includes('status')) status = value;
    if (label.includes('author') || label.includes('penulis')) author = value;
  });

  const rating = $('.post-total-rating .score').text().trim();

  const chaptersUrl = url.endsWith('/') ? `${url}ajax/chapters/` : `${url}/ajax/chapters/`;
  const chaptersHtml = await fetchPagePost(chaptersUrl, signal);

  const $ch = cheerio.load(chaptersHtml);
  const chapters: NovelDetail['chapters'] = [];
  $ch('li.wp-manga-chapter').each((_i, el) => {
    const $el = $ch(el);
    const link = $el.find('a').first();
    const chapterUrl = link.attr('href') || '';
    const chapterTitle = link.text().trim();
    const releaseDate = $el.find('.chapter-release-date i').text().trim()
      || $el.find('span i').first().text().trim();

    if (chapterTitle && chapterUrl) {
      chapters.push({
        chapter: chapterTitle,
        chapterUrl: normalizeUrl(chapterUrl),
        releaseDate,
      });
    }
  });

  return {
    title,
    alternativeTitle,
    thumbnailUrl: normalizeUrl(thumbnailUrl),
    synopsis,
    genres,
    status,
    author,
    rating,
    chapters,
  };
}

export async function getNovelReading(
  url: string,
  signal?: AbortSignal,
): Promise<NovelReading> {
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);

  const breadcrumbs = $('ol.breadcrumb li');
  const chapter = breadcrumbs.last().text().trim() || $('#chapter-heading').text().trim() || '';
  const title = breadcrumbs.eq(breadcrumbs.length - 2).text().trim() || '';
  const thumbnailUrl = '';

  const content: string[] = [];
  $('.text-left p, .reading-content p, .entry-content p').each((_i, el) => {
    const text = $(el).text().trim();
    if (text.length > 0) {
      content.push(text);
    }
  });

  const nextChapter = $('.nav-next a, a.next_page').attr('href');
  const prevChapter = $('.nav-previous a, a.prev_page').attr('href');

  return {
    title,
    chapter,
    thumbnailUrl,
    content,
    nextChapter: nextChapter ? normalizeUrl(nextChapter) : undefined,
    prevChapter: prevChapter ? normalizeUrl(prevChapter) : undefined,
  };
}

export async function novelSearch(
  query: string,
  signal?: AbortSignal,
): Promise<NovelSearch[]> {
  const path = `/?s=${encodeURIComponent(query)}&post_type=wp-manga`;
  const html = await fetchPage(path, signal);
  const $ = cheerio.load(html);
  const results: NovelSearch[] = [];

  $('.c-tabs-item__content, .row.c-tabs-item__content').each((_i, el) => {
    const $el = $(el);
    const title = $el.find('.post-title a').text().trim();
    const detailUrl = $el.find('.post-title a').attr('href') || '';
    const thumbnailUrl = $el.find('img').attr('data-src')
      || $el.find('img').attr('src')
      || '';
    const latestChapter = $el.find('.chapter a').first().text().trim();
    const rating = $el.find('.score').text().trim();
    const genres: string[] = [];
    $el.find('.genres a, .mg_genres a').each((_i2, genreEl) => {
      genres.push($(genreEl).text().trim());
    });

    if (title && detailUrl) {
      results.push({
        title,
        thumbnailUrl: normalizeUrl(thumbnailUrl),
        detailUrl: normalizeUrl(detailUrl),
        latestChapter,
        genres,
        rating,
      });
    }
  });

  return results;
}
