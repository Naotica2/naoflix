import { AniDetail, AniStreaming, EpisodeBaruHome, NewAnimeList, SearchAnime } from '../types/anime';
import deviceUserAgent from './deviceUserAgent';

const BASE_URL = 'https://www.sankavollerei.com/anime/stream';

async function extractDirectVideoUrl(
  pageUrl: string,
  quality: string = '720',
  signal?: AbortSignal,
): Promise<{ url: string; type: 'mp4' | 'hls' } | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': deviceUserAgent },
      signal,
    });
    const html = await res.text();
    const sourceMatch = html.match(/<source\s+src="([^"]+)"/i);
    if (sourceMatch && sourceMatch[1]) {
      const videoUrl = sourceMatch[1];
      if (
        videoUrl.includes('googlevideo.com') ||
        videoUrl.includes('googleusercontent.com') ||
        videoUrl.endsWith('.mp4')
      ) {
        return { url: videoUrl, type: 'mp4' };
      }
      if (videoUrl.includes('video/mp4') || videoUrl.includes('videoplayback')) {
        return { url: videoUrl, type: 'mp4' };
      }
    }

    const jwFileMatch = html.match(/"file"\s*:\s*"([^"]+)"/);
    if (jwFileMatch && jwFileMatch[1]) {
      let fileUrl = jwFileMatch[1];
      if (fileUrl.startsWith('/')) {
        const baseUrl = new URL(pageUrl);
        fileUrl = `${baseUrl.protocol}//${baseUrl.host}${fileUrl}`;
      }

      const typeMatch = html.match(/"type"\s*:\s*"([^"]+)"/);
      const declaredType = typeMatch ? typeMatch[1] : '';

      if (
        declaredType.includes('mpegurl') ||
        declaredType.includes('hls') ||
        fileUrl.includes('.m3u8')
      ) {
        const appendedUrl = fileUrl.includes('?') ? `${fileUrl}&is_hls=1` : `${fileUrl}?is_hls=1`;
        return { url: appendedUrl, type: 'hls' };
      }
      if (fileUrl.endsWith('.mp4') || declaredType.includes('mp4')) {
        return { url: fileUrl, type: 'mp4' };
      }
      return { url: fileUrl, type: 'mp4' };
    }

    if (pageUrl.includes('blogger.com') || pageUrl.includes('video.g')) {
      const bloggerMp4 = await getBloggerVideo(pageUrl, quality, signal);
      if (bloggerMp4) {
        return { url: bloggerMp4, type: 'mp4' };
      }
    }

    const videoSrcMatch = html.match(/(?:src|source|file|url)\s*[:=]\s*['"]?(https?:\/\/[^'">\s]+\.(?:mp4|m3u8)[^'">\s]*)/i);
    if (videoSrcMatch && videoSrcMatch[1]) {
      const url = videoSrcMatch[1];
      const isHlsCheck = url.includes('.m3u8');
      return { url: isHlsCheck ? (url.includes('?') ? `${url}&is_hls=1` : `${url}?is_hls=1`) : url, type: isHlsCheck ? 'hls' : 'mp4' };
    }

    if (pageUrl.includes('yourupload.com') || pageUrl.includes('yup.php')) {
      let yupHtml = html;
      const iframeSrc = html.match(/<iframe[^>]+src=["']([^"']*yourupload[^"']*)["']/i);
      if (iframeSrc && iframeSrc[1]) {
        const yupRes = await fetch(iframeSrc[1], {
          headers: { 'User-Agent': deviceUserAgent },
          signal,
        });
        yupHtml = await yupRes.text();
      }
      const vidcacheMatch = yupHtml.match(/https?:\/\/vidcache\.net[^\s'"<>]+\.mp4[^\s'"<>]*/i);
      if (vidcacheMatch) {
        return { url: vidcacheMatch[0], type: 'mp4' };
      }
    }

    return null;
  } catch (e) {
    return null;
  }
}

let requestCounter = 0;
function getReqId() {
  const now = new Date();
  const secondsSinceMidnight = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const reqid = 1 + secondsSinceMidnight + requestCounter * 100000;
  requestCounter++;
  return reqid;
}

async function getBloggerVideo(url: string, quality: string = '720', signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': deviceUserAgent }, signal });
  const text = await res.text();
  try {
    const streamsMatch = text.match(/"streams":(\[.*?\])/);
    if (streamsMatch && streamsMatch[1]) {
       const streamsArr = JSON.parse(streamsMatch[1]);
       let targetFormat = 22; // 720p
       if (quality === '360') targetFormat = 18;
       else if (quality === '480') targetFormat = 59;
       else if (quality === '1080') targetFormat = 37;

       let best = streamsArr.find((s: any) => s.format_id === targetFormat);
       if (!best && quality === '720') best = streamsArr.find((s: any) => s.format_id === 59);
       if (!best) best = streamsArr.find((s: any) => s.format_id === 18);
       if (!best && streamsArr.length > 0) best = streamsArr[0];

       if (best && best.play_url) return best.play_url;
    }
    return text.split('"streams":[{"play_url":"')[1].split('"')[0];
  } catch {
    const token = new URL(url).searchParams.get('token');
    if (!token) throw new Error('Token Blogger tidak ditemukan');
    const f_sid = text.split('FdrFJe":"')[1].split('"')[0];
    const bl = text.split('cfb2h":"')[1].split('"')[0];
    const response = await fetch(
      `https://www.blogger.com/_/BloggerVideoPlayerUi/data/batchexecute?rpcids=WcwnYd&source-path=%2Fvideo.g&f.sid=${f_sid}&bl=${bl}&hl=en-US&_reqid=${getReqId()}&rt=c`,
      {
        signal,
        headers: {
          accept: '*/*',
          'accept-language': 'en-US,en;q=0.9',
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': deviceUserAgent,
          'x-same-domain': '1',
          Referer: 'https://www.blogger.com/',
        },
        body: `f.req=%5B%5B%5B%22WcwnYd%22%2C%22%5B%5C%22${token}%5C%22%2C%5C%22%5C%22%2C0%5D%22%2Cnull%2C%22generic%22%5D%5D%5D&`,
        method: 'POST',
      },
    );
    const apiText = await response.text();
    const links = apiText.split('https://rr');
    if (links.length > 1) {
       links.shift();
       const cleanedLinks = links.map(l => {
           const encoded = l.split('\\\\",[')[0].replace(/\\\\/g, '\\');
           return JSON.parse(`"https://rr${encoded}"`);
       });
       if (quality === '360' && cleanedLinks.length >= 1) return cleanedLinks[0];
       if (quality === '480' && cleanedLinks.length >= 2) return cleanedLinks[1];
       if ((quality === '720' || quality === '1080') && cleanedLinks.length >= 1) return cleanedLinks[cleanedLinks.length - 1];
       return cleanedLinks[cleanedLinks.length - 1];
    }
    throw new Error('Gagal memuat video blogger');
  }
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const apiCache = new Map<string, { data: any; timestamp: number }>();

function buildCacheKey(endpoint: string) {
  return endpoint;
}

const sankaAnimeApi = {
  async fetchSanka(endpoint: string, signal?: AbortSignal, ignoreCache = false) {
    const cacheKey = buildCacheKey(endpoint);
    const now = Date.now();

    if (!ignoreCache) {
      const cached = apiCache.get(cacheKey);
      if (cached && now - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
      }
    }

    const maxRetries = 2;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const url = `${BASE_URL}${endpoint}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const onAbort = () => controller.abort();
        if (signal) signal.addEventListener('abort', onAbort);
        
        let res;
        try {
          res = await fetch(url, { signal: controller.signal });
        } finally {
          clearTimeout(timeoutId);
          if (signal) signal.removeEventListener('abort', onAbort);
        }
        
        if (!res.ok) {
          throw new Error(`AnimeIndo Network Error: ${res.status}`);
        }

        const json = await res.json();
        
        if (json.status === 200 || json.status === 'success') {
          apiCache.set(cacheKey, { data: json, timestamp: now });
          return json;
        } else {
          throw new Error(`AnimeIndo API returned an error: ${JSON.stringify(json)}`);
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || err.message === 'Aborted') {
          throw err;
        }
        attempt++;
        if (attempt >= maxRetries) {
          throw err;
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  },

  async home(signal?: AbortSignal): Promise<EpisodeBaruHome> {
    try {
      const [latestRes, popularRes] = await Promise.all([
        this.fetchSanka('/latest', signal).catch(() => null),
        this.fetchSanka('/popular', signal).catch(() => null),
      ]);

      const newAnime: NewAnimeList[] = [];
      
      const addToList = (list: any[], typeName: string) => {
        if (Array.isArray(list)) {
          list.forEach((item: any) => {
            newAnime.push({
              title: item.title,
              thumbnailUrl: item.poster,
              episode: item.episode || '1',
              streamingLink: `sanka://episode/${encodeURIComponent(item.slug)}`,
              releaseDate: '',
              releaseDay: typeName,
            });
          });
        }
      };

      if (latestRes && latestRes.data) {
        addToList(latestRes.data, 'Latest');
      }
      if (popularRes && popularRes.data) {
        addToList(popularRes.data, 'Popular');
      }

      return {
        newAnime,
        jadwalAnime: {},
      };
    } catch (e: any) {
      throw new Error('Gagal mengambil data Home NaoFlix: ' + e.message);
    }
  },

  async newAnime(page: number, signal?: AbortSignal): Promise<NewAnimeList[]> {
    try {
      const res = await this.fetchSanka(`/latest/${page}`, signal);
      const list: NewAnimeList[] = [];
      if (res.data && Array.isArray(res.data)) {
        res.data.forEach((item: any) => {
          list.push({
            title: item.title,
            thumbnailUrl: item.poster,
            episode: item.episode || '1',
            streamingLink: `sanka://episode/${encodeURIComponent(item.slug)}`,
            releaseDate: '',
            releaseDay: 'Latest',
          });
        });
      }
      return list;
    } catch (e: any) {
      if (e.message !== 'Aborted') throw e;
      return [];
    }
  },

  async search(query: string, signal?: AbortSignal): Promise<SearchAnime> {
    try {
      const result: SearchAnime['result'] = [];
      const addedSlugs = new Set<string>();

      const pushItem = (item: any, prepend = false) => {
        const slug = item.slug || '';
        const expectedUrl = `sanka://detail/${encodeURIComponent(slug)}`;
        if (addedSlugs.has(slug)) return;
        addedSlugs.add(slug);
        const entry = {
          title: item.title,
          thumbnailUrl: item.poster,
          animeUrl: expectedUrl,
          status: item.status || 'Unknown',
          genres: item.genres || [],
          rating: item.rating || '',
        };
        if (prepend) result.unshift(entry);
        else result.push(entry);
      };

      const translateToRomaji = async (): Promise<string | null> => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 6000);
          const jikanUrl = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1`;
          const jikanRes = await fetch(jikanUrl, {
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
          });
          clearTimeout(timeout);
          const jikanJson = await jikanRes.json();
          if (jikanJson?.data && Array.isArray(jikanJson.data) && jikanJson.data.length > 0) {
            return jikanJson.data[0].title || null;
          }
          return null;
        } catch {
          return null;
        }
      };

      const [mainRes, romajiTitle, lat1, lat2, lat3] = await Promise.all([
        this.fetchSanka(`/search/${encodeURIComponent(query)}`, signal).catch(() => ({ data: [] })),
        translateToRomaji(),
        this.fetchSanka('/latest/1', signal).catch(() => null),
        this.fetchSanka('/latest/2', signal).catch(() => null),
        this.fetchSanka('/latest/3', signal).catch(() => null),
      ]);

      let romajiRes: any = null;
      if (romajiTitle && romajiTitle.toLowerCase() !== query.toLowerCase()) {
        romajiRes = await this.fetchSanka(`/search/${encodeURIComponent(romajiTitle)}`, signal).catch(() => ({ data: [] }));
      }

      if (romajiRes?.data) {
        for (const item of romajiRes.data) {
          pushItem(item, true);
        }
      }

      if (mainRes?.data) {
        for (const item of mainRes.data) {
          pushItem(item);
        }
      }

      const scanLatestPages = (pages: any[]) => {
        const lowerQuery = query.toLowerCase();
        const lowerRomaji = romajiTitle ? romajiTitle.toLowerCase() : '';
        const allLatest = pages.flatMap(p => p?.data || []);
        
        for (const item of allLatest) {
          if (!item.title) continue;
          const lowerTitle = item.title.toLowerCase();
          if (lowerTitle.includes(lowerQuery) || (lowerRomaji && lowerTitle.includes(lowerRomaji))) {
            const animeSlugRaw = item.slug.replace(/-episode-\d+.*$/, '');
            pushItem({
              ...item,
              slug: animeSlugRaw,
              title: item.title.replace(/\sEpisode\s\d+.*$/i, ''),
              status: 'Ongoing',
            }, true);
          }
        }
      };

      try { scanLatestPages([lat1, lat2, lat3]); } catch {}

      if (result.length === 0) {
        try {
          const morePages = await Promise.all([
            this.fetchSanka('/latest/4', signal).catch(() => null),
            this.fetchSanka('/latest/5', signal).catch(() => null),
            this.fetchSanka('/latest/6', signal).catch(() => null),
            this.fetchSanka('/latest/7', signal).catch(() => null),
            this.fetchSanka('/latest/8', signal).catch(() => null),
          ]);
          scanLatestPages(morePages);
        } catch {
        }
      }

      return { result };
    } catch (e: any) {
      if (e.message !== 'Aborted') throw e;
      return { result: [] };
    }
  },

  async detail(animeId: string, signal?: AbortSignal): Promise<AniDetail> {
    try {
      const decodedId = decodeURIComponent(animeId);
      const parts = decodedId.split('|');
      const slug = parts[parts.length - 1];
      const encodedSlug = encodeURIComponent(slug);

      const res = await this.fetchSanka(`/anime/${encodedSlug}`, signal);
      const data = res.data;
      
      if (!data) {
        throw new Error('Data anime kosong atau tidak tersedia.');
      }

      const episodeList: { title: string; link: string; releaseDate: string }[] = [];
      if (Array.isArray(data.episodes)) {
        data.episodes.forEach((ep: any) => {
          let epTitle = String(ep.eps_title || '').trim();
          
          epTitle = epTitle.replace(/^Episode\s+/i, 'Episode ');
          
          if (/^\d/.test(epTitle)) {
             epTitle = `Episode ${epTitle}`;
          }

          episodeList.push({
            title: epTitle,
            link: `sanka://episode/${encodeURIComponent(ep.eps_slug)}`,
            releaseDate: ''
          });
        });
      }

      if (episodeList.length > 1 && episodeList[0].title.includes('01') === false) {
         episodeList.reverse();
      }

      return {
        type: 'animeDetail',
        title: data.title || slug,
        thumbnailUrl: data.poster || '',
        status: data.status || 'Unknown',
        animeType: 'TV',
        studio: data.studio || 'Unknown',
        releaseYear: data.release_year || 'Unknown',
        genres: data.genres || [],
        rating: data.rating || '',
        synopsis: data.synopsis || 'Tidak ada sinopsis.',
        episodeList,
        detailOnly: false,
        epsTotal: String(episodeList.length || '?'),
        minutesPerEp: '24 min',
        alternativeTitle: data.title || '',
      };
    } catch (e: any) {
      if (e.message !== 'Aborted') {
        throw new Error(`Gagal memuat detail anime: ${e.message}`);
      }
      throw e;
    }
  },

  async streaming(episodeId: string, signal?: AbortSignal): Promise<AniStreaming> {
    try {
      const decodedId = decodeURIComponent(episodeId);
      const parts = decodedId.split('|');
      const slug = parts[parts.length - 1];
      const encodedSlug = encodeURIComponent(slug);

      const res = await this.fetchSanka(`/episode/${encodedSlug}`, signal);
      const data = res.data;
      
      if (!data || !data.stream_links) throw new Error('Data episode tidak ditemukan.');

      let primaryStreamUrl = '';
      let downloadLink = '';
      let streamIsHls = false;
      let serverResolutions: { resolution: string; dataContent: string }[] = [];

      if (Array.isArray(data.stream_links)) {
        const availableLinks = data.stream_links.filter((link: any) => 
          link.server && !link.server.toUpperCase().includes('GDRIVE')
        );

        const newServerResolutions: { resolution: string; dataContent: string }[] = [];
        availableLinks.forEach((link: any) => {
          const s = link.server ? link.server.toUpperCase() : '';
          if (s === 'B-TUBE') {
            newServerResolutions.push({ resolution: '360p (SD)', dataContent: `sanka-server:${link.server}|360::${link.url}` });
            newServerResolutions.push({ resolution: '480p (SD)', dataContent: `sanka-server:${link.server}|480::${link.url}` });
            newServerResolutions.push({ resolution: '720p (HD)', dataContent: `sanka-server:${link.server}|720::${link.url}` });
          } else {
            let resName = link.server;
            if (s === 'CEPAT') resName = '1080p (Auto)';
            else if (s === 'MP4') resName = 'MP4Upload';
            else if (s === 'YUP') resName = 'YouRUpload';
            
            newServerResolutions.push({
              resolution: resName,
              dataContent: `sanka-server:${link.server}::${link.url}`
            });
          }
        });
        serverResolutions = newServerResolutions;

        const btube = availableLinks.find((s: any) =>
          s.server && s.server.toUpperCase() === 'B-TUBE'
        );
        const cepat = availableLinks.find((s: any) =>
          s.server && s.server.toUpperCase() === 'CEPAT'
        );
        const mp4up = availableLinks.find((s: any) =>
          s.server && s.server.toUpperCase() === 'MP4'
        );
        const yup = availableLinks.find((s: any) =>
          s.server && s.server.toUpperCase() === 'YUP'
        );
        const mainStream = btube || cepat || mp4up || yup || availableLinks[0];

        if (mainStream) {
          primaryStreamUrl = mainStream.url;
        }
      }

      if (primaryStreamUrl) {
        const originalUrl = primaryStreamUrl;
        const extracted = await extractDirectVideoUrl(primaryStreamUrl, '360', signal);
        if (extracted) {
          const isDirectHostNativePlayable = !extracted.url.includes('mp4upload') && !extracted.url.includes('vidcache');
          if (isDirectHostNativePlayable || extracted.type === 'hls') {
            primaryStreamUrl = extracted.url;
          }
          streamIsHls = extracted.type === 'hls';
          if (extracted.type === 'mp4') {
            downloadLink = extracted.url;
          }
        }
      }

      if (!downloadLink && Array.isArray(data.download_links) && data.download_links.length > 0) {
        const bestDl = data.download_links.find((d: any) => d.server && d.server.toLowerCase().includes('gdrive')) || data.download_links[0];
        downloadLink = bestDl.url;
      }

      if (!primaryStreamUrl) {
        throw new Error('Tidak ada stream tersedia di Anime Indo API.');
      }

      const isNativePlayable =
        primaryStreamUrl.includes('googlevideo.com') ||
        primaryStreamUrl.includes('googleusercontent.com') ||
        primaryStreamUrl.endsWith('.mp4') ||
        primaryStreamUrl.endsWith('.m3u8') ||
        primaryStreamUrl.includes('.m3u8') ||
        streamIsHls;

      let finalTitle = data.title || slug;
      const epMatch = slug.match(/-episode-(\d+(-\d+)?)/i);
      if (epMatch && !finalTitle.toLowerCase().includes('episode')) {
        finalTitle = `${finalTitle} - Episode ${epMatch[1]}`;
      }

      const animeSlugRaw = slug.replace(/-episode-\d+.*$/, '');
      const animeDetailUrl = `sanka://detail/${encodeURIComponent(animeSlugRaw)}`;

      return {
        type: 'animeStreaming',
        title: finalTitle,
        streamingLink: primaryStreamUrl,
        streamingType: (isNativePlayable ? 'raw' : 'embed') as 'raw' | 'embed',
        downloadLink: downloadLink,
        isHls: streamIsHls,
        resolution: serverResolutions.length > 0
          ? (serverResolutions.find(s => s.resolution === '360p (SD)')?.resolution
            || serverResolutions.find(s => s.resolution === '480p (SD)')?.resolution
            || serverResolutions.find(s => s.resolution === '720p (HD)')?.resolution
            || serverResolutions.find(s => s.resolution === '1080p (Auto)')?.resolution
            || serverResolutions[0].resolution)
          : undefined,
        resolutionRaw: serverResolutions,
        thumbnailUrl: data.poster || '',
        episodeData: { 
            animeDetail: animeDetailUrl,
            previous: data.prev_slug ? `sanka://episode/${encodeURIComponent(data.prev_slug)}` : '',
            next: data.next_slug ? `sanka://episode/${encodeURIComponent(data.next_slug)}` : ''
        },
        reqNonceAction: 'sanka-api',
        reqResolutionWithNonceAction: 'sanka-api',
      };
    } catch (e: any) {
      if (e.message !== 'Aborted') {
        throw new Error(`Gagal memuat episode streaming: ${e.message}`);
      }
      throw e;
    }
  },

  async getResolution(resId: string, signal?: AbortSignal) {
    if (!resId.includes('::')) return resId;
    const parts = resId.split('::');
    const serverPrefix = parts[0];
    const serverPageUrl = parts.slice(1).join('::');

    let quality = '720';
    if (serverPrefix.includes('|')) {
       quality = serverPrefix.split('|')[1];
    }

    const extracted = await extractDirectVideoUrl(serverPageUrl, quality, signal);
    if (extracted) {
      return extracted.url;
    }

    if (serverPageUrl.includes('blogger.com') || serverPageUrl.includes('video.g')) {
      try {
        const decoded = decodeURIComponent(serverPageUrl);
        const rawMp4 = await getBloggerVideo(decoded, quality, signal);
        return rawMp4;
      } catch {
        return serverPageUrl;
      }
    }

    return serverPageUrl;
  },

  flushCache() {
    apiCache.clear();
  }
};

export default sankaAnimeApi;
