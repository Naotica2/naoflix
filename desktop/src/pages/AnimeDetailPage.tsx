import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Star, Calendar, Tv, Clock, Film } from 'lucide-react';
import { fetch } from '@tauri-apps/plugin-http';
import * as cheerio from 'cheerio';
import type { AnimeEpisode } from '../scrapers/animeTypes';

type AnimeDetail = {
  title: string;
  thumbnailUrl: string;
  synopsis: string;
  genres: string[];
  rating: string;
  status: string;
  studio: string;
  type: string;
  epsTotal: string;
  duration: string;
  releaseYear: string;
  episodes: { title: string; link: string; releaseDate: string }[];
};

export function AnimeDetailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const item = (location.state as any)?.item as AnimeEpisode | undefined;

  const [detail, setDetail] = useState<AnimeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [playingEp, setPlayingEp] = useState('');
  const [loadingStream, setLoadingStream] = useState(false);

  useEffect(() => {
    if (!item?.streamingLink) { setLoading(false); return; }
    fetchAnimeDetail(item.streamingLink, item).then(d => {
      setDetail(d);
      setLoading(false);
    }).catch(e => {
      console.error('Detail fetch error:', e);
      setLoading(false);
    });
  }, [item]);

  const playEpisode = useCallback(async (epUrl: string, epTitle: string) => {
    setLoadingStream(true);
    setPlayingEp(epUrl);
    try {
      const res = await fetch(epUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept: 'text/html' },
      });
      const html = await res.text();
      const $ = cheerio.load(html);

      let url = '';
      $('iframe').each((_, el) => {
        const src = $(el).attr('src') || '';
        if (src) url = src;
      });
      if (!url) {
        $('video source, video').each((_, el) => {
          const src = $(el).attr('src') || '';
          if (src && (src.includes('.mp4') || src.includes('.m3u8'))) url = src;
        });
      }
      if (!url) {
        $('.mirrorstream a, .streamlink a, .download a, a[href*=".mp4"], a[href*=".m3u8"]').each((_, el) => {
          const href = $(el).attr('href') || '';
          if (href.includes('mp4') || href.includes('m3u8')) url = href;
        });
      }

      if (url) {
        navigate('/watch', {
          state: {
            type: 'anime',
            streamUrl: url,
            title: detail?.title || item?.title || 'Anime',
            episode: epTitle,
            contentId: `anime_${btoa(epUrl).slice(0, 20)}`,
          },
        });
      } else {
        window.open(epUrl, '_blank');
      }
    } catch (e) {
      console.error('Stream error:', e);
      window.open(epUrl, '_blank');
    } finally {
      setLoadingStream(false);
      setPlayingEp('');
    }
  }, [detail, item, navigate]);

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;
  if (!item) return <div className="page"><p>Anime tidak ditemukan</p></div>;

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <button className="btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: 16, fontSize: 13 }}>
        <ArrowLeft size={16} /> Kembali
      </button>

      <div className="film-detail">
        <div className="film-poster">
          <img src={detail?.thumbnailUrl || item.thumbnailUrl} alt={item.title} style={{ borderRadius: 12 }} />
        </div>
        <div className="film-info">
          <h1 className="film-title">{detail?.title || item.title}</h1>
          <div className="film-meta" style={{ flexWrap: 'wrap', gap: 12 }}>
            {detail?.rating && <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--warning)' }}><Star size={14} /> {detail.rating}</span>}
            {detail?.epsTotal && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Film size={14} /> {detail.epsTotal} Episode</span>}
            {detail?.status && <span>{detail.status}</span>}
            {detail?.studio && <span>{detail.studio}</span>}
            {detail?.type && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Tv size={14} /> {detail.type}</span>}
            {detail?.duration && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={14} /> {detail.duration}</span>}
            {detail?.releaseYear && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={14} /> {detail.releaseYear}</span>}
          </div>
          {detail?.genres && detail.genres.length > 0 && (
            <div className="film-genres">
              {detail.genres.map(g => <span key={g} className="genre-tag">{g}</span>)}
            </div>
          )}
          {detail?.synopsis && <p className="film-synopsis">{detail.synopsis}</p>}
          {!detail?.synopsis && (
            <div style={{ marginTop: 8 }}>
              <span style={{ background: 'var(--accent-gradient)', color: '#fff', padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>{item.episode}</span>
              {item.releaseDay && <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 13 }}>{item.releaseDay}</span>}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
            <button className="btn-primary" onClick={() => playEpisode(item.streamingLink, item.episode)} disabled={loadingStream} style={{ fontSize: 15, padding: '12px 28px' }}>
              <Play size={18} /> {loadingStream ? 'Memuat...' : 'Tonton ' + item.episode}
            </button>
          </div>
        </div>
      </div>

      {/* Episode List */}
      {detail?.episodes && detail.episodes.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Daftar Episode ({detail.episodes.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {detail.episodes.map((ep, i) => (
              <button
                key={i}
                className="btn-secondary"
                onClick={() => playEpisode(ep.link, ep.title)}
                disabled={loadingStream}
                style={{ justifyContent: 'flex-start', fontSize: 13, width: '100%', textAlign: 'left' }}
              >
                <Play size={14} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{ep.title}</span>
                {ep.releaseDate && <span style={{ fontSize: 11, opacity: 0.7 }}>{ep.releaseDate}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

async function fetchAnimeDetail(episodeUrl: string, fallback: AnimeEpisode): Promise<AnimeDetail> {
  try {
    const res = await fetch(episodeUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept: 'text/html' },
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    let detailUrl = '';
    $('a[href*="/anime/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.includes('/anime/') && !href.includes('/episode/')) {
        detailUrl = href.startsWith('http') ? href : `https://otakudesu.blog${href}`;
      }
    });

    if (detailUrl) {
      const detailRes = await fetch(detailUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept: 'text/html' },
      });
      const detailHtml = await detailRes.text();
      const $d = cheerio.load(detailHtml);

      const title = $d('h1.entry-title').text().replace(/Subtitle Indonesia/i, '').trim() || fallback.title;
      let synopsis = '', rating = '', status = '', studio = '', type = 'TV', epsTotal = '', duration = '', releaseYear = '';

      $d('.infozingle span, .infozin span').each((_, el) => {
        const text = $d(el).text().trim();
        if (text.startsWith('Skor:')) rating = text.replace('Skor:', '').trim();
        else if (text.startsWith('Status:')) status = text.replace('Status:', '').trim();
        else if (text.startsWith('Studio:')) studio = text.replace('Studio:', '').trim();
        else if (text.startsWith('Tipe:')) type = text.replace('Tipe:', '').trim();
        else if (text.startsWith('Total Episode:')) epsTotal = text.replace('Total Episode:', '').trim();
        else if (text.startsWith('Durasi:')) duration = text.replace('Durasi:', '').trim();
        else if (text.startsWith('Tanggal Rilis:')) releaseYear = text.replace('Tanggal Rilis:', '').trim();
      });

      synopsis = $d('.sinopc, .sino498, .sino').first().text().trim() || $d('meta[property="og:description"]').attr('content') || '';
      const genres: string[] = [];
      $d('a[href*="/genres/"]').each((_, el) => { const g = $d(el).text().trim(); if (g) genres.push(g); });
      const thumbnailUrl = $d('meta[property="og:image"]').attr('content') || $d('.fotoanime img').attr('src') || fallback.thumbnailUrl;

      const episodes: { title: string; link: string; releaseDate: string }[] = [];
      const seen = new Set<string>();
      $d('.episodelist ul li').each((_, el) => {
        const a = $d(el).find('a').first();
        let link = a.attr('href') || '';
        if (link.startsWith('/')) link = `https://otakudesu.blog${link}`;
        if (!link || seen.has(link)) return;
        seen.add(link);
        const epText = a.text().trim();
        const date = $d(el).find('.zemark').text().trim();
        if (epText && link.includes('/episode/')) episodes.push({ title: epText.replace(/Subtitle Indonesia/i, '').trim(), link, releaseDate: date });
      });
      episodes.reverse();

      return { title, thumbnailUrl, synopsis, genres, rating, status, studio, type, epsTotal, duration, releaseYear, episodes };
    }

    return { title: fallback.title, thumbnailUrl: fallback.thumbnailUrl, synopsis: '', genres: [], rating: '', status: '', studio: '', type: '', epsTotal: '', duration: '', releaseYear: '', episodes: [] };
  } catch (e) {
    return { title: fallback.title, thumbnailUrl: fallback.thumbnailUrl, synopsis: '', genres: [], rating: '', status: '', studio: '', type: '', epsTotal: '', duration: '', releaseYear: '', episodes: [] };
  }
}
