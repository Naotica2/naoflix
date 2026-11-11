import cheerio from 'cheerio';
import deviceUserAgent from '../deviceUserAgent';
import cleanSynopsis from '../cleanSynopsis';
import {
  KomikuDetail,
  KomikuReading,
  KomikuSearch,
  LatestKomikuRelease,
} from './komiku';

export const __ALIAS = 'bacakomik';
export const DOMAIN = 'bacakomik.my';
export const BASE_URL = `https://${DOMAIN}`;

function cleanTitle(raw: string): string {
  if (!raw) return '';
  let t = raw.replace(/^Komik\s+/i, '').trim();
  if (t.length >= 6 && t.length % 2 === 0) {
    const half = t.slice(0, t.length / 2);
    if (half + half === t) return half;
  }
  return t;
}

function proxyImg(url: string | undefined): string {
  if (!url) return '';
  if (url.startsWith('http') && !url.includes('wsrv.nl')) {
    return 'https://wsrv.nl/?url=' + encodeURIComponent(url);
  }
  return url;
}

function normalizeUrl(url: string | undefined): string {
  if (!url || url === '') return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${BASE_URL}${url}`;
  return `${BASE_URL}/${url}`;
}

async function fetchPage(url: string, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onAbort);

  try {
    const response = await fetch(normalizeUrl(url), {
      headers: {
        'User-Agent': deviceUserAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

function parseBacakomikCards($: ReturnType<typeof cheerio.load>): LatestKomikuRelease[] {
  const results: LatestKomikuRelease[] = [];

  $('.animepost').each((_i, el) => {
    const $el = $(el);
    const a = $el.find('a').first();
    const href = a.attr('href') || '';
    const rawTitle = a.attr('title') || $el.find('.tt h4, .tt h3, .tt').text().trim();
    const title = cleanTitle(rawTitle);
    const imgEl = $el.find('img').first();
    const lazySrc = imgEl.attr('data-lazy-src') || imgEl.attr('data-src') || '';
    const srcAttr = imgEl.attr('src') || '';
    const rawImg = lazySrc || (!srcAttr.startsWith('data:') ? srcAttr : '');
    const img = proxyImg(rawImg);
    const ch =
      $el.find('.lsch a').first().text().replace(/\s+/g, ' ').trim() ||
      $el.find('.adds .epx, .epxs').first().text().trim();
    const date = $el.find('.datech').text().trim();
    const rawType =
      $el.find('.typeflag').attr('class')?.replace('typeflag', '').trim() ||
      $el.find('.typearm').text().trim();
    let type: 'Manga' | 'Manhwa' | 'Manhua' = 'Manga';
    if (/manhwa/i.test(rawType)) type = 'Manhwa';
    else if (/manhua/i.test(rawType)) type = 'Manhua';

    if (title && href) {
      results.push({
        title,
        thumbnailUrl: img,
        detailUrl: normalizeUrl(href),
        type,
        latestChapter: ch,
        concept: '',
        shortDescription: date ? `Rilis: ${date}` : '',
        additionalInfo: date,
      });
    }
  });

  return results;
}

export async function getLatestBacakomikReleases(
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestKomikuRelease[]> {
  try {
    const url = page === 1 ? `${BASE_URL}/` : `${BASE_URL}/page/${page}/`;
    const html = await fetchPage(url, signal);
    const $ = cheerio.load(html);
    return parseBacakomikCards($);
  } catch (error) {
    console.error('Bacakomik latest error:', error);
    return [];
  }
}

export async function getPopularBacakomikReleases(
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestKomikuRelease[]> {
  try {
    const url = page === 1 ? `${BASE_URL}/komik-populer/` : `${BASE_URL}/komik-populer/page/${page}/`;
    const html = await fetchPage(url, signal);
    const $ = cheerio.load(html);
    return parseBacakomikCards($);
  } catch (error) {
    console.error('Bacakomik popular error:', error);
    return [];
  }
}

export async function getManhwaBacakomikReleases(
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestKomikuRelease[]> {
  try {
    const url = page === 1 ? `${BASE_URL}/baca-manhwa/` : `${BASE_URL}/baca-manhwa/page/${page}/`;
    const html = await fetchPage(url, signal);
    const $ = cheerio.load(html);
    return parseBacakomikCards($);
  } catch (error) {
    console.error('Bacakomik manhwa error:', error);
    return [];
  }
}

export async function getBacakomikByGenre(
  genre: string,
  page: number = 1,
  signal?: AbortSignal,
): Promise<LatestKomikuRelease[]> {
  try {
    const slug = genre.toLowerCase().trim().replace(/\s+/g, '-');
    if (slug === 'manhwa') {
      return await getManhwaBacakomikReleases(page, signal);
    }
    const url = page === 1 ? `${BASE_URL}/genres/${slug}/` : `${BASE_URL}/genres/${slug}/page/${page}/`;
    const html = await fetchPage(url, signal);
    const $ = cheerio.load(html);
    return parseBacakomikCards($);
  } catch (error) {
    console.error('Bacakomik genre error:', error);
    return [];
  }
}

export async function getBacakomikDetailFromUrl(
  url: string,
  signal?: AbortSignal,
): Promise<KomikuDetail> {
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);

  const title = cleanTitle($('h1.entry-title, .infox h1, h1').first().text()) || 'Komik';
  const imgEl = $('.thumb img').first();
  const rawThumb =
    imgEl.attr('data-lazy-src') ||
    imgEl.attr('data-src') ||
    imgEl.attr('src') ||
    '';
  const thumb = proxyImg(rawThumb);
  const rawSynopsis = $('.desc, .entry-content-single, .sinopsis')
    .first()
    .text();
  const synopsis = cleanSynopsis(rawSynopsis);

  const genres: string[] = [];
  $('.genre-info a, .genres a').each((_i, el) => {
    const g = $(el).text().trim();
    if (g && !genres.includes(g)) genres.push(g);
  });

  const metadata: Record<string, string> = {};
  $('.spe span, .infox .spe span').each((_i, el) => {
    const text = $(el).text().trim();
    if (text.includes(':')) {
      const [k, ...v] = text.split(':');
      metadata[k.trim()] = v.join(':').trim();
    }
  });

  let type: 'Manga' | 'Manhwa' | 'Manhua' = 'Manga';
  const rawType = metadata['Jenis Komik'] || metadata['Type'] || '';
  if (/manhwa/i.test(rawType)) type = 'Manhwa';
  else if (/manhua/i.test(rawType)) type = 'Manhua';

  let status: 'Ongoing' | 'End' | 'Data tidak tersedia' = 'Ongoing';
  const rawStatus = metadata['Status'] || '';
  if (/tamat|end|complete/i.test(rawStatus)) status = 'End';

  const author = metadata['Author'] || metadata['Pengarang'] || 'Unknown';
  const alternativeTitle = metadata['Judul Alternatif'] || '';

  const chapters: KomikuDetail['chapters'] = [];
  $('#chapterlist li, .bxcl ul li').each((_i, el) => {
    const chA = $(el).find('a');
    const chUrl = chA.attr('href') || '';
    const rawCh = chA.find('.chapternum, span').text().trim() || chA.text().trim();
    const chTitle = rawCh.replace(/\s+/g, ' ').trim();
    const chDate = $(el).find('.chapterdate').text().trim();
    if (chUrl) {
      chapters.push({
        chapter: chTitle,
        chapterUrl: chUrl,
        releaseDate: chDate,
        views: '',
      });
    }
  });

  return {
    title,
    indonesianTitle: alternativeTitle || title,
    type,
    author,
    status,
    minAge: metadata['Jumlah Pembaca'] ? `${metadata['Jumlah Pembaca']} Pembaca` : 'Data tidak tersedia',
    concept: metadata['Serialisasi'] || 'Data tidak tersedia',
    readingDirection: 'Data tidak tersedia',
    headerImageUrl: thumb,
    thumbnailUrl: thumb,
    genres,
    synopsis: synopsis || 'Tidak ada sinopsis yang tersedia.',
    chapters,
  };
}

export async function getBacakomikReading(
  url: string,
  signal?: AbortSignal,
): Promise<KomikuReading> {
  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);

  const images: string[] = [];
  $('#anjay_ini_id_kh img, #chimg-auh img, #readerarea img').each((_i, el) => {
    const src =
      $(el).attr('data-lazy-src') ||
      $(el).attr('data-src') ||
      $(el).attr('src') ||
      '';
    if (
      src &&
      !src.startsWith('data:') &&
      !src.includes('avatar') &&
      !src.includes('logo') &&
      !src.includes('wp-includes') &&
      !images.includes(src)
    ) {
      images.push(proxyImg(src.trim()));
    }
  });

  const rawTitle = $('h1.entry-title, h1').first().text().trim();
  const fullTitle = cleanTitle(rawTitle).replace(/\s*(?:Bahasa Indonesia|Sub Indo)$/i, '').trim();
  let title = fullTitle || 'Komik';
  let chapter = '';

  const chapMatch = fullTitle.match(/(?:\s*[-–|:]?\s*)((?:Chapter|Ch\.?)\s*\d+(?:[.,]\d+)?(?:\s*[^\d\s].*)?)$/i)
    || fullTitle.match(/((?:Chapter|Ch\.?)\s*\d+(?:[.,]\d+)?)/i);
  if (chapMatch) {
    chapter = chapMatch[1].replace(/^ch\.?\s*/i, 'Chapter ').trim();
    title = fullTitle.replace(chapMatch[0], '').trim() || fullTitle;
  } else {
    const slugMatch = url.match(/chapter[-/]?(\d+(?:[.-]\d+)?)/i);
    if (slugMatch?.[1]) {
      chapter = `Chapter ${slugMatch[1].replace('-', '.')}`;
    } else {
      chapter = fullTitle || 'Chapter';
    }
  }
  const prevChapter =
    $('a.ch-prev-btn, .nextprev a[rel="prev"], a[rel="prev"]').attr('href') ||
    undefined;
  const nextChapter =
    $('a.ch-next-btn, .nextprev a[rel="next"], a[rel="next"]').attr('href') ||
    undefined;

  return {
    title,
    chapter,
    thumbnailUrl: '',
    releaseDate: '',
    comicImages: images,
    nextChapter,
    prevChapter,
  };
}

export async function bacakomikSearch(
  query: string,
  signal?: AbortSignal,
): Promise<KomikuSearch[]> {
  try {
    const url = `${BASE_URL}/?s=${encodeURIComponent(query)}`;
    const html = await fetchPage(url, signal);
    const $ = cheerio.load(html);

    const results: KomikuSearch[] = [];

    $('.animepost').each((_i, el) => {
      const $el = $(el);
      const a = $el.find('a').first();
      const href = a.attr('href') || '';
      const rawTitle = a.attr('title') || $el.find('.tt h4, .tt').text().trim();
      const title = cleanTitle(rawTitle);
      const imgEl = $el.find('img');
      const rawImg =
        imgEl.attr('data-lazy-src') ||
        imgEl.attr('data-src') ||
        imgEl.attr('src') ||
        '';
      const img = proxyImg(rawImg);
      const ch = $el.find('.lsch a').text().replace(/\s+/g, ' ').trim() || $el.find('.adds .epx, .epxs').text().trim();
      const rawType = $el.find('.typeflag').attr('class')?.replace('typeflag', '').trim() || $el.find('.typearm').text().trim();
      let type: 'Manga' | 'Manhwa' | 'Manhua' = 'Manga';
      if (/manhwa/i.test(rawType)) type = 'Manhwa';
      else if (/manhua/i.test(rawType)) type = 'Manhua';

      if (title && href) {
        results.push({
          title,
          thumbnailUrl: img,
          detailUrl: href,
          type,
          latestChapter: ch,
          concept: '',
          additionalInfo: '',
        });
      }
    });

    return results;
  } catch (error) {
    console.error('Bacakomik search error:', error);
    return [];
  }
}

export async function getBacakomikDetailUrlFromChapter(
  url: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const pathOnly = url.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
  const initialSegs = pathOnly.split('/').filter(Boolean);
  if (
    (initialSegs.length === 2 &&
      initialSegs[0].toLowerCase() === 'komik' &&
      !['page', 'hot', 'popular', 'genre', 'genres', 'daftar-komik'].includes(
        initialSegs[1].toLowerCase(),
      )) ||
    url.includes('page=manga')
  ) {
    return normalizeUrl(url);
  }

  const html = await fetchPage(url, signal);
  const $ = cheerio.load(html);
  const candidates: string[] = [];
  $(
    '.allc a[href], .ts-breadcrumb a[href], .breadcrumb a[href], .nvx a[href], a[href*="/komik/"], a[href*="page=manga"]',
  ).each((_i, el) => {
    const href = $(el).attr('href');
    if (href) candidates.push(href);
  });

  for (const href of candidates) {
    if (href.includes('page=manga')) {
      return normalizeUrl(href);
    }
    const cleanPath = href.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
    const segs = cleanPath.split('/').filter(Boolean);
    if (
      segs.length === 2 &&
      segs[0].toLowerCase() === 'komik' &&
      !['page', 'hot', 'popular', 'genre', 'genres', 'daftar-komik'].includes(segs[1].toLowerCase())
    ) {
      return `${BASE_URL}/komik/${segs[1]}/`;
    }
  }
  return null;
}
