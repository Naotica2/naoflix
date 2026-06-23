import React, { useState, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Play, ArrowLeft, Star, Calendar } from 'lucide-react';
import { getPlayStreams, getCaptions, MovieboxSearchItem } from '../scrapers/moviebox';

export function FilmDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const item = (location.state as any)?.item as MovieboxSearchItem | undefined;

  const [loading, setLoading] = useState(false);

  const handlePlay = useCallback(async () => {
    if (!id || !item) return;
    setLoading(true);
    try {
      const [streamData, captionData] = await Promise.all([
        getPlayStreams(item.subjectId, item.detailPath),
        getCaptions(item.subjectId, item.detailPath),
      ]);
      navigate('/watch', {
        state: {
          type: 'film',
          streams: streamData,
          captions: captionData,
          title: item.title,
          contentId: `film_${item.subjectId}`,
        },
      });
    } catch (e) {
      console.error('Failed to load streams:', e);
      setLoading(false);
    }
  }, [id, item, navigate]);

  if (!item) return <div className="page"><p>Film tidak ditemukan</p></div>;

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <button className="btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: 16, fontSize: 13 }}>
        <ArrowLeft size={16} /> Kembali
      </button>

      <div className="film-detail">
        <div className="film-poster">
          <img src={item.cover?.url || ''} alt={item.title} />
        </div>
        <div className="film-info">
          <h1 className="film-title">{item.title}</h1>
          <div className="film-meta">
            {item.releaseDate && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={14} /> {item.releaseDate.slice(0, 4)}</span>}
            {item.imdbRatingValue && <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--warning)' }}><Star size={14} /> {item.imdbRatingValue}</span>}
            {item.countryName && <span>{item.countryName}</span>}
          </div>
          {item.genre && (
            <div className="film-genres">
              {item.genre.split(',').map(g => <span key={g.trim()} className="genre-tag">{g.trim()}</span>)}
            </div>
          )}
          {item.description && <p className="film-synopsis">{item.description}</p>}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
            <button className="btn-primary" onClick={handlePlay} disabled={loading} style={{ fontSize: 15, padding: '12px 28px' }}>
              <Play size={18} /> {loading ? 'Memuat...' : 'Tonton Sekarang'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
