import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { getAnimeSourceId, setActiveAnimeSource, getAllAnimeSources } from '../scrapers/animeSource';
import type { AnimeSourceId } from '../scrapers/animeTypes';

export function SettingsPage() {
  const { profile } = useAuth();
  const [activeSource, setActiveSource] = useState<AnimeSourceId>(getAnimeSourceId());
  const allSources = getAllAnimeSources();

  const handleSourceToggle = (id: AnimeSourceId) => {
    // Must keep at least 1 active - switching to new source
    setActiveAnimeSource(id);
    setActiveSource(id);
  };

  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>

      <section className="section">
        <h2 className="section-title">Profile</h2>
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <img src="/icon.png" alt="" style={{ width: 48, height: 48, borderRadius: 12 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{profile?.display_name || profile?.username || 'Guest'}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>@{profile?.username}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
            <span>Level {profile?.level || 1}</span>
            <span>{profile?.total_exp?.toLocaleString() || 0} EXP</span>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Extension Sources</h2>
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, border: '1px solid var(--border)' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
            Pilih sumber konten untuk anime dan film. Hanya 1 sumber anime yang bisa aktif.
          </p>

          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 8 }}>
            Anime
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {allSources.map(source => {
              const isActive = source.id === activeSource;
              return (
                <div key={source.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{source.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {source.id === 'otakudesu' ? 'Scraping dari Otakudesu' : 'API dari Animelovers'}
                    </div>
                  </div>
                  <button
                    onClick={() => handleSourceToggle(source.id)}
                    style={{
                      background: isActive ? 'var(--accent)' : 'var(--bg-hover)',
                      color: isActive ? '#fff' : 'var(--text-secondary)',
                      border: 'none',
                      borderRadius: 8,
                      padding: '6px 14px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {isActive ? 'Aktif' : 'Aktifkan'}
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', margin: '16px 0 8px' }}>
            Film
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>MovieBox</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Film dan series dengan subtitle Indonesia</div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>Aktif</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">About</h2>
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/icon.png" alt="" style={{ width: 32, height: 32, borderRadius: 8 }} />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>NaoFlix Desktop</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>v2.0.1 - Built with Tauri + React</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
