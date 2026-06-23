import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { searchMoviebox, MovieboxSearchItem } from '../scrapers/moviebox';
import { getActiveAnimeSource } from '../scrapers/animeSource';
import type { AnimeEpisode } from '../scrapers/animeTypes';

type TabType = 'anime' | 'film';

export function BrowsePage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabType>('anime');
  const [query, setQuery] = useState('');
  const [animeResults, setAnimeResults] = useState<AnimeEpisode[]>([]);
  const [filmResults, setFilmResults] = useState<MovieboxSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (keyword: string, searchTab: TabType) => {
    if (!keyword.trim()) return;
    setLoading(true);
    setSearched(true);

    try {
      if (searchTab === 'anime') {
        const source = getActiveAnimeSource();
        const results = await source.search(keyword);
        setAnimeResults(results);
      } else {
        const data = await searchMoviebox(keyword, 0);
        setFilmResults(data.items);
      }
    } catch {
      if (searchTab === 'anime') setAnimeResults([]);
      else setFilmResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (val.trim().length >= 2) doSearch(val, tab);
    }, 400);
  };

  const switchTab = (newTab: TabType) => {
    setTab(newTab);
    if (query.trim().length >= 2) doSearch(query, newTab);
  };

  return (
    <div className="page">
      <h1 className="page-title">Browse</h1>

      <div className="search-tabs">
        <button className={`search-tab ${tab === 'anime' ? 'active' : ''}`} onClick={() => switchTab('anime')}>
          Anime
        </button>
        <button className={`search-tab ${tab === 'film' ? 'active' : ''}`} onClick={() => switchTab('film')}>
          Film & Series
        </button>
      </div>

      <div className="search-bar">
        <SearchIcon size={18} color="var(--text-muted)" />
        <input
          placeholder={tab === 'anime' ? 'Cari anime...' : 'Cari film atau series...'}
          value={query}
          onChange={e => handleInputChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doSearch(query, tab)}
          autoFocus
        />
        {loading && <div className="spinner" style={{ width: 20, height: 20 }} />}
      </div>

      {!searched ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 60 }}>
          Ketik judul {tab === 'anime' ? 'anime' : 'film atau series'} untuk mencari
        </p>
      ) : tab === 'anime' ? (
        animeResults.length === 0 && !loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 60 }}>Tidak ada hasil untuk "{query}"</p>
        ) : (
          <div className="content-grid">
            {animeResults.map((item, i) => (
              <div key={item.streamingLink || i} className="content-card" onClick={() => navigate('/anime', { state: { item } })}>
                <div className="img-wrapper">
                  <img src={item.thumbnailUrl} alt={item.title} loading="lazy" decoding="async" />
                  <div className="ep-badge">{item.episode}</div>
                </div>
                <div className="content-card-body">
                  <div className="content-card-title">{item.title}</div>
                  <div className="content-card-meta">{item.releaseDay && <span>{item.releaseDay}</span>}</div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        filmResults.length === 0 && !loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 60 }}>Tidak ada hasil untuk "{query}"</p>
        ) : (
          <div className="content-grid">
            {filmResults.map((item, i) => (
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
        )
      )}
    </div>
  );
}
