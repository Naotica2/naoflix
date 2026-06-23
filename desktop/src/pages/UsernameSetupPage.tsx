import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../auth/supabaseClient';

export function UsernameSetupPage() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user || username.length < 3) return;
    setIsSubmitting(true);
    setError('');
    try {
      const { error } = await supabase.from('profiles').insert({
        id: user.id,
        username: username.toLowerCase(),
        avatar_url: user.user_metadata?.avatar_url || null,
        display_name: fullName || null,
      });
      if (error) {
        setError(error.code === '23505' ? 'Username sudah dipakai' : error.message);
        return;
      }
      await refreshProfile();
      navigate('/');
    } catch (e: any) {
      setError(e.message || 'Gagal menyimpan username');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="setup-page">
      <div className="setup-card">
        <h2 className="setup-title">Buat Username</h2>
        <p className="setup-subtitle">Pilih username unik untuk profilmu. Ini hanya bisa dilakukan sekali.</p>
        {error && <p style={{ color: 'var(--danger)', marginBottom: 12, fontSize: 13 }}>{error}</p>}
        <input
          className="input-field"
          placeholder="Username (min 3 karakter)"
          value={username}
          onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
        />
        <input
          className="input-field"
          placeholder="Nama lengkap (opsional)"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
        />
        <button
          className="btn-primary"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={handleSubmit}
          disabled={isSubmitting || username.length < 3}
        >
          {isSubmitting ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
    </div>
  );
}
