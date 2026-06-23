import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTrending, MovieboxSearchItem } from '../scrapers/moviebox';
import { getActiveAnimeSource } from '../scrapers/animeSource';
import type { AnimeEpisode } from '../scrapers/animeTypes';
import { Film, Tv } from 'lucide-react';

export function HomePage() {
  const navigate = useNavigate();
  const [films, setFilms] = useState<MovieboxSearchItem[]>([]);
  const [anime, setAnime] = useState<AnimeEpisode[]>([]);
  const [loadingFilms, setLoadingFilms] = useState(true);
  const [loadingAnime, setLoadingAnime] = useState(true);
  const [sourceName, setSourceName] = useState('');
  const [animeError, setAnimeError] = useState('');
  const [filmError, setFilmError] = useState('');

  useEffect(() => {
    // Load films from MovieBox
    getTrending(0).then(data => {
      setFilms(data.slice(0, 12));
      setLoadingFilms(false);
    }).catch((e) => { setFilmError(String(e)); setLoadingFilms(false); });

    // Load anime from active source
    const source = getActiveAnimeSource();
    setSourceName(source.name);
    source.home().then(data => {
      setAnime(data.slice(0, 12));
      setLoadingAnime(false);
    }).catch((e) => { setAnimeError(String(e)); setLoadingAnime(false); });
  }, []);

  return (
    <div className="page">
      <section className="section">
        <div className="section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Tv size={20} color="var(--accent)" />
            <h2 className="section-title">Anime Terbaru</h2>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: 4 }}>
              {sourceName}
            </span>
          </div>
          <a className="section-more" onClick={() => navigate('/browse', { state: { tab: 'anime' } })}>Lihat Semua</a>
        </div>
        {loadingAnime ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>
        ) : anime.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', padding: 20, fontSize: 13 }}>
            Tidak ada data anime dari {sourceName}
            {animeError && <span style={{ display: 'block', color: 'var(--danger)', marginTop: 4, fontSize: 11 }}>Error: {animeError}</span>}
          </p>
        ) : (
          <div className="content-grid">
            {anime.map((item, i) => (
              <div key={item.streamingLink || i} className="content-card" onClick={() => navigate('/anime', { state: { item } })}>
                <div className="img-wrapper">
                  <img src={item.thumbnailUrl} alt={item.title} loading="lazy" decoding="async" />
                  <div className="ep-badge">{item.episode}</div>
                </div>
                <div className="content-card-body">
                  <div className="content-card-title">{item.title}</div>
                  <div className="content-card-meta">
                    {item.releaseDay && <span>{item.releaseDay}</span>}
                    {item.releaseDate && <span>{item.releaseDate}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section" style={{ marginTop: 40 }}>
        <div className="section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Film size={20} color="var(--accent)" />
            <h2 className="section-title">Film Trending</h2>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: 4 }}>
              MovieBox
            </span>
          </div>
          <a className="section-more" onClick={() => navigate('/browse', { state: { tab: 'film' } })}>Lihat Semua</a>
        </div>
        {loadingFilms ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>
        ) : films.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', padding: 20, fontSize: 13 }}>
            Tidak ada data film
            {filmError && <span style={{ display: 'block', color: 'var(--danger)', marginTop: 4, fontSize: 11 }}>Error: {filmError}</span>}
          </p>
        ) : (
          <div className="content-grid">
            {films.map((item, i) => (
              <div key={item.subjectId || i} className="content-card" onClick={() => navigate(`/film/${item.subjectId}`, { state: { item } })}>
                <div className="img-wrapper">
                  <img src={item.cover?.url} alt={item.title} loading="lazy" decoding="async" />
                </div>
                <div className="content-card-body">
                  <div className="content-card-title">{item.title}</div>
                  <div className="content-card-meta">
                    {item.genre && <span className="badge badge-movie">{item.genre.split(',')[0]?.trim()}</span>}
                    {item.imdbRatingValue && <span style={{ color: 'var(--warning)' }}>★ {item.imdbRatingValue}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
