import React, { useState } from 'react';
import { Clock, Bookmark, Play } from 'lucide-react';

export function MyListsPage() {
  const [tab, setTab] = useState<'history' | 'watchlater'>('history');

  return (
    <div className="page">
      <h1 className="page-title">My Lists</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button
          className={tab === 'history' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setTab('history')}
          style={{ fontSize: 13 }}
        >
          <Clock size={16} /> Riwayat Tontonan
        </button>
        <button
          className={tab === 'watchlater' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setTab('watchlater')}
          style={{ fontSize: 13 }}
        >
          <Bookmark size={16} /> Tonton Nanti
        </button>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 20px',
        color: 'var(--text-muted)',
      }}>
        {tab === 'history' ? (
          <>
            <Play size={48} strokeWidth={1.5} style={{ marginBottom: 16, opacity: 0.5 }} />
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Belum ada riwayat
            </p>
            <p style={{ fontSize: 13, textAlign: 'center', maxWidth: 300, lineHeight: 1.5 }}>
              Film dan anime yang kamu tonton akan muncul di sini.
            </p>
          </>
        ) : (
          <>
            <Bookmark size={48} strokeWidth={1.5} style={{ marginBottom: 16, opacity: 0.5 }} />
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Daftar tontonan kosong
            </p>
            <p style={{ fontSize: 13, textAlign: 'center', maxWidth: 300, lineHeight: 1.5 }}>
              Simpan film dan anime untuk ditonton nanti.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
