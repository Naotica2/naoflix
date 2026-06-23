import React, { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Menu, X, Search, MoreVertical, Settings, LogOut, LogIn, Bookmark, Home } from 'lucide-react';

export function MainLayout() {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    setAccountOpen(false);
    navigate('/');
  };

  const navLink = (to: string, label: string, icon: React.ReactNode) => (
    <NavLink
      to={to}
      onClick={() => setMenuOpen(false)}
      className={({ isActive }: { isActive: boolean }) => `nf-hamburger-item ${isActive ? 'active' : ''}`}
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );

  return (
    <div className="nf-layout">
      {/* Netflix-style top navbar */}
      <header className="nf-navbar">
        <div className="nf-navbar-left">
          {/* Hamburger menu */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button className="nf-hamburger-btn" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            {menuOpen && (
              <div className="nf-hamburger-dropdown">
                {navLink('/', 'Home', <Home size={16} />)}
                {navLink('/browse', 'Browse', <Search size={16} />)}
                {navLink('/my-lists', 'My Lists', <Bookmark size={16} />)}
              </div>
            )}
          </div>

          {/* Logo */}
          <div className="nf-logo" onClick={() => navigate('/')}>
            <img src="/icon.png" alt="NaoFlix" style={{ width: 28, height: 28, borderRadius: 6, cursor: 'pointer' }} />
            <span className="nf-logo-text">NaoFlix</span>
          </div>
        </div>

        <div className="nf-navbar-right">
          {/* Search button */}
          <button className="nf-icon-btn" onClick={() => navigate('/browse')} title="Search">
            <Search size={18} />
          </button>

          {/* Account 3-dot menu */}
          <div ref={accountRef} style={{ position: 'relative' }}>
            <button className="nf-icon-btn" onClick={() => setAccountOpen(!accountOpen)}>
              <MoreVertical size={18} />
            </button>
            {accountOpen && (
              <div className="nf-account-dropdown">
                {user ? (
                  <>
                    <div className="nf-account-info">
                      <div className="nf-avatar">{profile?.username?.[0]?.toUpperCase() || '?'}</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{profile?.username || 'User'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lv.{profile?.level || 1} · {profile?.total_exp?.toLocaleString() || 0} EXP</div>
                      </div>
                    </div>
                    <div className="nf-dropdown-divider" />
                    <button className="nf-dropdown-item" onClick={() => { setAccountOpen(false); navigate('/settings'); }}>
                      <Settings size={15} /> Settings
                    </button>
                    <button className="nf-dropdown-item nf-dropdown-danger" onClick={handleSignOut}>
                      <LogOut size={15} /> Logout
                    </button>
                  </>
                ) : (
                  <button className="nf-dropdown-item" onClick={() => { setAccountOpen(false); navigate('/login'); }}>
                    <LogIn size={15} /> Login
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="nf-main">
        <Outlet />
      </main>
    </div>
  );
}
