import { fetch } from '@tauri-apps/plugin-http';
import * as cheerio from 'cheerio';
import type { AnimeEpisode, AnimeSource } from './animeTypes';

const DOMAIN = 'otakudesu.blog';
const BASE = `https://${DOMAIN}`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchPage(url: string): Promise<string> {
  console.log('[Otakudesu] Fetching:', url);
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
    },
  });
  console.log('[Otakudesu] Response status:', res.status);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  console.log('[Otakudesu] HTML length:', text.length);
  return text;
}

export const otakudesu: AnimeSource = {
  id: 'otakudesu',
  name: 'Otakudesu',

  async home(): Promise<AnimeEpisode[]> {
    try {
      const html = await fetchPage(BASE);
      const $ = cheerio.load(html);
      const episodes: AnimeEpisode[] = [];

      $('.venz ul li').each((_, el) => {
        const $li = $(el);
        const detpost = $li.find('.detpost');
        if (detpost.length === 0) return;

        const episode = detpost.find('.epz').text().replace(/[\s\n]+/g, ' ').trim();
        const day = detpost.find('.epztipe').text().trim();
        const date = detpost.find('.newnime').text().trim();

        const a = detpost.find('.thumb a').first();
        let link = a.attr('href') || '';
        if (link.startsWith('/')) link = `${BASE}${link}`;

        const title = detpost.find('.jdlflm').text().trim() ||
                      detpost.find('.thumbz img').attr('alt') || '';
        const poster = detpost.find('.thumbz img').attr('src') || '';

        if (title && link) {
          episodes.push({
            title,
            thumbnailUrl: poster,
            episode: episode || '',
            streamingLink: link,
            releaseDate: date,
            releaseDay: day || 'Terbaru',
          });
        }
      });

      return episodes;
    } catch (e) {
      console.error('[Otakudesu] home FAILED:', e);
      throw e;
    }
  },

  async search(query: string): Promise<AnimeEpisode[]> {
    try {
      const url = `${BASE}/?s=${encodeURIComponent(query)}&post_type=anime`;
      const html = await fetchPage(url);
      const $ = cheerio.load(html);
      const results: AnimeEpisode[] = [];

      $('.chivsrc li').each((_, el) => {
        const $li = $(el);
        const a = $li.find('h2 a').first();
        const title = a.text().trim();
        let link = a.attr('href') || '';
        const poster = $li.find('img').attr('src') || '';
        const genres = $li.find('.set').first().text().replace('Genres : ', '').trim();

        if (title && link) {
          results.push({
            title,
            thumbnailUrl: poster,
            episode: genres || 'Search Result',
            streamingLink: link,
            releaseDate: '',
          });
        }
      });

      return results;
    } catch (e) {
      console.error('[Otakudesu] search FAILED:', e);
      throw e;
    }
  },
};
