import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Maximize, Minimize, MessageCircle } from 'lucide-react';
import Hls from 'hls.js';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../auth/supabaseClient';

// Detect if URL is a direct video or an embed/iframe URL
function isDirectVideo(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('.mp4') || lower.includes('.m3u8') || lower.includes('.webm') || lower.includes('.mkv');
}

export function WatchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const state = (location.state as any) || {};
  const { type, streamUrl, title, episode, contentId, streams, captions, selectedStream: initialStream } = state;

  const [currentStream, setCurrentStream] = useState(initialStream || 0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const cid = contentId || (type === 'film' ? `film_${state.item?.subjectId || 'unknown'}` : 'anime_unknown');

  // Get the actual stream URL
  const actualUrl = type === 'film' && streams?.[currentStream]?.url ? streams[currentStream].url : streamUrl;
  const useIframe = actualUrl && !isDirectVideo(actualUrl);

  // Load video (only for direct video URLs)
  useEffect(() => {
    if (useIframe || !videoRef.current || !actualUrl) return;
    const video = videoRef.current;

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    if (actualUrl.includes('.m3u8')) {
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(actualUrl);
        hls.attachMedia(video);
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = actualUrl;
      }
    } else {
      video.src = actualUrl;
    }
  }, [currentStream, actualUrl, useIframe]);

  // Fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      if (e.key === ' ' && videoRef.current && !useIframe) { e.preventDefault(); videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause(); }
      if (e.key === 'Escape' && document.fullscreenElement) document.exitFullscreen();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleFullscreen, useIframe]);

  // Comments
  useEffect(() => {
    supabase.from('comments').select('*').eq('content_id', cid).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { if (data) setComments(data); });
  }, [cid]);

  const submitComment = async () => {
    if (!user || !commentText.trim()) return;
    const { data } = await supabase.from('comments').insert({
      content_id: cid, user_id: user.id, username: profile?.username || 'Anonymous', text: commentText.trim(),
    }).select().single();
    if (data) { setComments(prev => [data, ...prev]); setCommentText(''); }
  };

  // Cleanup
  useEffect(() => () => { if (hlsRef.current) hlsRef.current.destroy(); }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#000' }}>
      {/* Top bar */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, transparent 100%)',
      }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 500 }}>
          <ArrowLeft size={20} /> Kembali
        </button>
        <div style={{ color: '#fff', fontSize: 15, fontWeight: 600, textAlign: 'center', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 16px' }}>
          {title} {episode && `— ${episode}`}
        </div>
        <div style={{ width: 80 }} />
      </div>

      {/* Player area */}
      <div ref={containerRef} className={`video-container ${isFullscreen ? 'fullscreen' : ''}`} style={{ flex: 1, borderRadius: 0, margin: 0, aspectRatio: 'unset' }}>
        {useIframe ? (
          <iframe
            src={actualUrl}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        ) : (
          <video ref={videoRef} controls autoPlay style={{ width: '100%', height: '100%' }}>
            {type === 'film' && captions?.filter((c: any) => c.lanName).map((c: any, i: number) => (
              <track key={i} kind="subtitles" src={c.url} srcLang={c.lan} label={c.lanName} default={c.lanName.toLowerCase().includes('indon')} />
            ))}
          </video>
        )}
        <button onClick={toggleFullscreen} style={{ position: 'absolute', bottom: 60, right: 16, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', padding: 10, borderRadius: 8, cursor: 'pointer', zIndex: 10 }}>
          {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>
      </div>

      {/* Server selector for film */}
      {type === 'film' && streams && streams.length > 1 && (
        <div style={{ display: 'flex', gap: 6, padding: '12px 20px', background: 'var(--bg-secondary)', flexWrap: 'wrap' }}>
          {streams.map((s: any, i: number) => (
            <button key={i} className={i === currentStream ? 'btn-primary' : 'btn-secondary'} onClick={() => setCurrentStream(i)} style={{ fontSize: 12 }}>
              {s.format || `Server ${i + 1}`} {s.resolutions && `(${s.resolutions})`}
            </button>
          ))}
        </div>
      )}

      {/* Comments section */}
      <div style={{ background: 'var(--bg-secondary)', padding: '16px 20px', maxHeight: 300, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, color: '#fff' }}>
            <MessageCircle size={16} /> Komentar ({comments.length})
          </h3>
        </div>

        {user ? (
          <div className="comment-input-row">
            <input placeholder="Tulis komentar..." value={commentText} onChange={e => setCommentText(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitComment()} />
            <button className="btn-primary" onClick={submitComment} style={{ padding: '10px 16px' }}>Kirim</button>
          </div>
        ) : (
          <div className="comment-login-prompt">
            <a onClick={() => navigate('/login')}>Login</a> untuk menulis komentar
          </div>
        )}

        {comments.map((c: any, i: number) => (
          <div key={i} className="comment-item">
            <div className="comment-avatar">{c.username?.[0]?.toUpperCase() || '?'}</div>
            <div className="comment-body">
              <div className="comment-author">@{c.username}</div>
              <div className="comment-text">{c.text}</div>
              <div className="comment-time">{c.created_at ? new Date(c.created_at).toLocaleString('id-ID') : ''}</div>
            </div>
          </div>
        ))}
        {comments.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '8px 0' }}>Belum ada komentar</p>}
      </div>
    </div>
  );
}
