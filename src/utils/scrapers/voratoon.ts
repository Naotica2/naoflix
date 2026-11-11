import cheerio from 'cheerio';
import he from 'he';
import deviceUserAgent from '../deviceUserAgent';
import cleanSynopsis from '../cleanSynopsis';

export const __ALIAS = 'voratoon';
export let DOMAIN = '13.voratoon.com';
export const BASE = () => `https://${DOMAIN}`;

export interface VoratoonListItem {
  title: string;
  link: string;
  img: string;
  chapter: string;
  type: 'Manga' | 'Manhwa' | 'Manhua';
}

let lastDomainCheck = 0;
async function refreshDomainIfNeeded(signal?: AbortSignal) {
  const now = Date.now();
  if (now - lastDomainCheck < 30 * 60 * 1000) return;
  lastDomainCheck = now;
  try {
    const res = await fetch('https://voratoon.id/', {
      headers: { 'User-Agent': deviceUserAgent },
      signal,
    });
    const html = await res.text();
    const match = html.match(/https?:\/\/(\d+\.voratoon\.com)/i);
    if (match && match[1]) {
      DOMAIN = match[1];
    }
  } catch {}
}

function normalizeVoratoonUrl(link: string): string {
  let url = link.trim();
  if (url.startsWith('voratoon://detail/')) {
    url = url.replace('voratoon://detail/', '/');
  } else if (url.startsWith('voratoon://detail')) {
    url = url.replace('voratoon://detail', '');
  } else if (url.startsWith('voratoon://chapter/')) {
    url = url.replace('voratoon://chapter/', '/');
  } else if (url.startsWith('voratoon://')) {
    url = url.replace('voratoon://', '/');
  } else if (url.startsWith('voratoon:/')) {
    url = url.replace('voratoon:/', '/');
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    url = url.replace(/https?:\/\/[^/]*voratoon[^/]*/i, BASE());
  } else {
    if (!url.startsWith('/')) url = '/' + url;
    url = `${BASE()}${url}`;
  }
  return url;
}

function normalizeImgUrl(rawUrl: string | undefined): string {
  if (!rawUrl) return '';
  const decoded = he
    .decode(rawUrl.trim())
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002f/gi, '/')
    .replace(/\\\//g, '/');
  if (!decoded || decoded.startsWith('data:')) return '';
  if (decoded.startsWith('//')) {
    return `https:${decoded}`;
  }
  if (decoded.startsWith('http://')) {
    return `https://${decoded.slice('http://'.length)}`;
  }
  if (decoded.startsWith('https://')) {
    return decoded;
  }
  if (decoded.startsWith('/')) {
    return `${BASE()}${decoded}`;
  }
  return decoded;
}

async function fetchPage(url: string, signal?: AbortSignal): Promise<string> {
  await refreshDomainIfNeeded(signal);
  const normalizedUrl = normalizeVoratoonUrl(url);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onAbort);

  try {
    const res = await fetch(normalizedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': deviceUserAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const loc = res.headers.get('location')!;
      try {
        const nextUrl = new URL(loc, normalizedUrl);
        if (nextUrl.hostname.includes('voratoon') && nextUrl.hostname !== DOMAIN) {
          DOMAIN = nextUrl.hostname;
        }
        return await fetchPage(nextUrl.toString(), signal);
      } catch {}
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.includes('Just a moment...') && text.includes('Cloudflare')) {
      throw new Error('CF');
    }
    return text;
  } catch (error: any) {
    if (error?.name === 'AbortError' && signal?.aborted) {
      throw error;
    }
    const msg = error?.message || String(error) || '';
    if (msg === 'CF') {
      const { setWebViewOpen } = require('../CFBypass');
      if (setWebViewOpen) setWebViewOpen.openWebViewCF(true, normalizedUrl);
      throw new Error('Silahkan selesaikan captcha');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

function detectVoratoonType(flagSrc: string, flagAlt: string): 'Manga' | 'Manhwa' | 'Manhua' {
  const combined = `${flagSrc} ${flagAlt}`.toLowerCase();
  if (combined.includes('manhwa') || combined.includes('/kr.')) return 'Manhwa';
  if (combined.includes('manhua') || combined.includes('/cn.') || combined.includes('/tw.')) return 'Manhua';
  return 'Manga';
}

function extractBrowseCards(html: string): VoratoonListItem[] {
  const $ = cheerio.load(html);
  const items: VoratoonListItem[] = [];
  const seen = new Set<string>();

  $('article.card.card-project, article.card').each((_i, el) => {
    const $el = $(el);
    const linkEl = $el.find('a.card-image-wrapper, a.card-title').first();
    const rawHref = linkEl.attr('href') || '';
    if (!rawHref.includes('/series/')) return;

    const cleanHref = rawHref.startsWith('http')
      ? rawHref.replace(/https?:\/\/[^/]+/i, '')
      : rawHref.startsWith('/')
        ? rawHref
        : `/${rawHref}`;
    if (seen.has(cleanHref)) return;

    const title = he.decode($el.find('a.card-title').text().trim() || linkEl.attr('title') || '');
    if (!title) return;

    let coverSrc = '';
    $el.find('img').each((_j, img) => {
      if (coverSrc) return;
      const $img = $(img);
      const cls = $img.attr('class') || '';
      const src = $img.attr('src') || $img.attr('data-src') || '';
      if (cls.includes('comic-type-flag') || src.includes('flagcdn.com')) return;
      if (src) coverSrc = src;
    });

    const flagEl = $el.find('img.comic-type-flag').first();
    const type = detectVoratoonType(flagEl.attr('src') || '', flagEl.attr('alt') || '');

    const rawChapter = $el.find('.tag-chapters').first().text().trim();
    const chapter = rawChapter.replace(/^Chapter\s*/i, '').trim() || '';

    seen.add(cleanHref);
    items.push({
      title,
      link: cleanHref,
      img: normalizeImgUrl(coverSrc),
      chapter,
      type,
    });
  });

  return items;
}

export async function getLatestComicsReleases(
  page = 1,
  signal?: AbortSignal,
): Promise<VoratoonListItem[]> {
  try {
    const content = await fetchPage(`${BASE()}/browse?sort=latest&page=${page}`, signal);
    return extractBrowseCards(content);
  } catch (e) {
    console.error('Voratoon latest error', e);
    return [];
  }
}

export async function getPopularComicsReleases(
  page = 1,
  signal?: AbortSignal,
): Promise<VoratoonListItem[]> {
  try {
    const content = await fetchPage(`${BASE()}/browse?sort=popular&page=${page}`, signal);
    return extractBrowseCards(content);
  } catch (e) {
    console.error('Voratoon popular error', e);
    return [];
  }
}

export async function getManhwaComicsReleases(
  page = 1,
  signal?: AbortSignal,
): Promise<VoratoonListItem[]> {
  try {
    const content = await fetchPage(`${BASE()}/browse?format=manhwa&page=${page}`, signal);
    return extractBrowseCards(content);
  } catch (e) {
    console.error('Voratoon manhwa error', e);
    return [];
  }
}

export async function getComicsSearch(
  keyword: string,
  page = 1,
  signal?: AbortSignal,
): Promise<VoratoonListItem[]> {
  try {
    const content = await fetchPage(
      `${BASE()}/browse?search=${encodeURIComponent(keyword)}&page=${page}`,
      signal,
    );
    return extractBrowseCards(content);
  } catch (e) {
    console.error('Voratoon search error', e);
    return [];
  }
}

export async function getComicsSearchWithGenre(
  genre: string,
  page = 1,
  signal?: AbortSignal,
): Promise<VoratoonListItem[]> {
  try {
    const slug = genre.toLowerCase().trim().replace(/\s+/g, '-');
    if (slug === 'manhwa') {
      return await getManhwaComicsReleases(page, signal);
    }
    const content = await fetchPage(
      `${BASE()}/browse?genre=${encodeURIComponent(slug)}&page=${page}`,
      signal,
    );
    return extractBrowseCards(content);
  } catch (e) {
    console.error('Voratoon genre error', e);
    return [];
  }
}

export async function getComicsDetail(link: string, signal?: AbortSignal) {
  try {
    const url = normalizeVoratoonUrl(link);
    const html = await fetchPage(url, signal);
    const $ = cheerio.load(html);

    const title = he.decode($('h1.series-title, h1').first().text().trim());
    const altTitle = he.decode($('p.alternative-title').first().text().trim());

    let rawCover = $('img[src*="/cover/"]').first().attr('src') || '';
    if (!rawCover) {
      $('img').each((_i, el) => {
        if (rawCover) return;
        const src = $(el).attr('src') || '';
        if (
          src &&
          !src.includes('avatar') &&
          !src.includes('logo') &&
          !src.includes('placeholder') &&
          !src.includes('histats') &&
          !src.includes('/icons/') &&
          !src.includes('flagcdn') &&
          (src.includes('.webp') ||
            src.includes('.jpg') ||
            src.includes('.jpeg') ||
            src.includes('.png') ||
            src.includes('.avif'))
        ) {
          rawCover = src;
        }
      });
    }
    const img = normalizeImgUrl(rawCover);

    const rawSynopsis =
      $('p.synopsis-desktop').first().text().trim() ||
      $('p.synopsis').first().text().trim();
    const synopsis = cleanSynopsis(rawSynopsis);

    const metadata: Record<string, string> = {};
    if (altTitle) metadata.Title = altTitle;

    $('.stats-grid .stat-item').each((_i, el) => {
      const label = $(el).find('.stat-label').text().trim();
      const val = $(el).find('.stat-val').text().trim();
      if (label && val) metadata[label] = val;
    });

    $('dl, .info-row, .metadata-item').each((_i, el) => {
      const key = $(el).find('dt, label, .label').first().text().trim().replace(/:$/, '');
      const val = $(el).find('dd, .value').first().text().trim();
      if (key && val && !metadata[key]) metadata[key] = val;
    });

    const flagEl = $('img.comic-type-flag, img[src*="flagcdn.com"]').first();
    if (!metadata.Type && flagEl.length) {
      metadata.Type = detectVoratoonType(flagEl.attr('src') || '', flagEl.attr('alt') || '');
    }

    const genres: string[] = [];
    $('a[href*="genre="], a[href*="/genre/"], .genre-tag').each((_i, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    const chapters: { title: string; link: string; time: string }[] = [];
    const seenCh = new Set<string>();
    $('ul.chapter-list a.chapter-item, .chapter-list a').each((_i, el) => {
      const $a = $(el);
      const chLink = $a.attr('href') || '';
      if (!chLink || !chLink.includes('/chapter/') || seenCh.has(chLink)) return;
      seenCh.add(chLink);
      const chTitle =
        $a.find('.chapter-number, .chapter-title, span').first().text().replace(/\s+/g, ' ').trim() ||
        $a.text().replace(/\s+/g, ' ').trim();
      const chDate = $a.find('.chapter-date, .time').first().text().trim();
      chapters.push({
        title: chTitle,
        link: chLink,
        time: chDate,
      });
    });

    if (chapters.length === 0) {
      $('a[href*="/chapter/"]').each((_i, el) => {
        const $a = $(el);
        const chLink = $a.attr('href') || '';
        if (!chLink || seenCh.has(chLink)) return;
        seenCh.add(chLink);
        const chTitle = $a.text().replace(/\s+/g, ' ').trim();
        chapters.push({
          title: chTitle,
          link: chLink,
          time: '',
        });
      });
    }

    return {
      title,
      img,
      synopsis,
      chapters,
      genres,
      metadata,
    };
  } catch (e) {
    console.error('Voratoon detail error', e);
    return null;
  }
}

export async function getComicsReading(link: string, signal?: AbortSignal) {
  try {
    const url = normalizeVoratoonUrl(link);
    const html = await fetchPage(url, signal);
    const $ = cheerio.load(html);

    const images: string[] = [];

    // 1. Primary: extract chapter images from Next.js RSC payload ("chapter":{...,"images":[...]})
    let chapterAnchor = html.indexOf('\\"chapter\\":');
    if (chapterAnchor < 0) chapterAnchor = html.indexOf('"chapter":');
    const rscSlice = (
      chapterAnchor >= 0 ? html.slice(chapterAnchor, chapterAnchor + 140000) : html
    )
      .replace(/\\"/g, '"')
      .replace(/\\\//g, '/')
      .replace(/\\u0026/g, '&');

    const imgArrMatch = /"images":\s*(\[\s*"https?:\/\/[^\]]+?\])/.exec(rscSlice);
    if (imgArrMatch && imgArrMatch[1]) {
      try {
        const parsed = JSON.parse(imgArrMatch[1]);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === 'string' && item.startsWith('http') && !images.includes(item)) {
              images.push(item);
            }
          }
        }
      } catch {}
    }

    // 2. Fallback: legacy dataImages or rendered DOM images
    if (images.length === 0) {
      const legacyMatch = /"dataImages":\{(.*?)\}/.exec(html);
      if (legacyMatch) {
        try {
          const dataImages = JSON.parse(`{${legacyMatch[1]}}`);
          Object.keys(dataImages)
            .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
            .forEach(k => {
              if (dataImages[k]) images.push(dataImages[k]);
            });
        } catch {}
      }
    }

    if (images.length === 0) {
      $('img[src*="/wp-content/img/"], section[class*="reader"] img, div[class*="reader"] img').each(
        (_i, el) => {
          const src = $(el).attr('src') || $(el).attr('data-src') || '';
          if (
            src &&
            !images.includes(src) &&
            !src.includes('flagcdn') &&
            !src.includes('googleusercontent') &&
            !src.includes('avatar') &&
            !src.includes('histats') &&
            !src.includes('/cover/') &&
            !src.includes('/badges/') &&
            !src.includes('/icons/') &&
            !src.includes('/prod/ads/') &&
            !src.includes('/logo/')
          ) {
            images.push(src);
          }
        },
      );
    }

    const normalizedImages: string[] = [];
    for (const rawImg of images) {
      const clean = normalizeImgUrl(rawImg);
      if (clean && !normalizedImages.includes(clean)) {
        normalizedImages.push(clean);
      }
    }

    let title = '';
    let chapter = '';
    const titleTagText = $('title').first().text().replace(/\s*\|\s*VoraToon.*/i, '').trim();
    const cleanedHeading = $('h1, .chapter-title, .title')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim();

    const extractChapNum = (text: string): string | null => {
      const m = /(?:^|\b)(?:Chapter|Ch\.?|Ep\.?|Episode)\s*0*(\d+(?:[.,]\d+)?)/i.exec(text);
      return m ? m[1].replace(',', '.') : null;
    };

    const rscChapIndex = /"chapterIndex":\s*(\d+(?:\.\d+)?)/.exec(rscSlice);
    const rscSeriesTitle = /"seriesTitle":\s*"([^"]+)"/.exec(html) || /"series":\{[^}]*"title":\s*"([^"]+)"/.exec(html);

    let chapNum = rscChapIndex?.[1] || null;
    if (!chapNum && cleanedHeading) chapNum = extractChapNum(cleanedHeading);
    if (!chapNum && titleTagText) chapNum = extractChapNum(titleTagText);
    if (!chapNum) {
      const urlChapMatch = /\/chapter\/([^/?#]+)/i.exec(url);
      if (urlChapMatch?.[1]) {
        const seg = decodeURIComponent(urlChapMatch[1]).replace(/^chapter[-_ ]*/i, '');
        const numMatch = /^(\d+(?:[-.]\d+)?)/.exec(seg);
        if (numMatch) {
          chapNum = numMatch[1].replace('-', '.');
        } else if (seg) {
          chapter = `Chapter ${seg.replace(/-/g, ' ').trim()}`;
        }
      }
    }

    if (chapNum) {
      chapter = `Chapter ${chapNum}`;
    } else if (!chapter) {
      const mTitle = /"chapterTitle":\s*"([^"]+)"/.exec(rscSlice);
      chapter = mTitle?.[1]?.trim() || 'Chapter';
    }

    if (rscSeriesTitle?.[1]) {
      title = he.decode(rscSeriesTitle[1].replace(/\\"/g, '"').trim());
    } else if (titleTagText) {
      title = titleTagText
        .replace(/^Baca\s+/i, '')
        .replace(/\s+(?:Chapter|Ch\.?)\s*\d+.*$/i, '')
        .replace(/\s+Bahasa Indonesia$/i, '')
        .trim();
    }
    if (!title && cleanedHeading) {
      title = cleanedHeading
        .replace(/^Baca\s+/i, '')
        .replace(/\s+(?:Chapter|Ch\.?)\s*\d+.*$/i, '')
        .trim();
    }
    if (!title) {
      title = chapter;
    }

    const toVoratoonChapterUri = (href: string) => {
      if (!href) return '';
      if (href.startsWith('voratoon://')) return href;
      const cleanPath = href.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '');
      return `voratoon://${cleanPath}`;
    };

    let nextChapter = '';
    let prevChapter = '';
    $('a[href*="/chapter/"]').each((_i, el) => {
      const $a = $(el);
      const href = $a.attr('href') || '';
      const text = ($a.text() || '').toLowerCase();
      const rel = ($a.attr('rel') || '').toLowerCase();
      const cls = ($a.attr('class') || '').toLowerCase();
      const aria = ($a.attr('aria-label') || '').toLowerCase();

      if (
        !nextChapter &&
        (text.includes('next') ||
          text.includes('selanjutnya') ||
          rel.includes('next') ||
          cls.includes('next') ||
          aria.includes('next'))
      ) {
        nextChapter = toVoratoonChapterUri(href);
      }
      if (
        !prevChapter &&
        (text.includes('prev') ||
          text.includes('sebelumnya') ||
          rel.includes('prev') ||
          cls.includes('prev') ||
          aria.includes('prev'))
      ) {
        prevChapter = toVoratoonChapterUri(href);
      }
    });

    const mCover =
      /"coverImage":"([^"]+)"/i.exec(rscSlice) ||
      /<img[^>]*src="([^"]*\/cover\/[^"]*)"/i.exec(html);
    const thumbnailUrl = mCover ? normalizeImgUrl(mCover[1]) : '';

    return {
      images: normalizedImages,
      title,
      chapter,
      thumbnailUrl,
      nextChapter,
      prevChapter,
    };
  } catch (e) {
    console.error('Voratoon reading error', e);
    return null;
  }
}

export async function getVoratoonDetailUrlFromChapter(
  link: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (link.startsWith('voratoon://detail')) return link;
  const directMatch = link.match(/\/series\/([^/?#]+)/i);
  if (directMatch?.[1]) {
    return `voratoon://detail/series/${directMatch[1]}`;
  }

  const html = await fetchPage(link, signal);
  const $ = cheerio.load(html);
  const candidates: string[] = [];
  $('.breadcrumb a[href*="/series/"], a[href*="/series/"]').each((_i, el) => {
    const href = $(el).attr('href');
    if (href && !href.includes('/chapter/')) candidates.push(href);
  });
  for (const href of candidates) {
    const m = href.match(/\/series\/([^/?#]+)/i);
    if (m?.[1]) {
      return `voratoon://detail/series/${m[1]}`;
    }
  }
  return null;
}
