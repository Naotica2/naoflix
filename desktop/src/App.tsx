import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { LoginPage } from './auth/LoginPage';
import { MainLayout } from './components/MainLayout';
import { HomePage } from './pages/HomePage';
import { BrowsePage } from './pages/BrowsePage';
import { FilmDetailPage } from './pages/FilmDetailPage';
import { AnimeDetailPage } from './pages/AnimeDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { UsernameSetupPage } from './pages/UsernameSetupPage';
import { MyListsPage } from './pages/MyListsPage';
import { WatchPage } from './pages/WatchPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup-username" element={<UsernameSetupPage />} />
      <Route path="/watch" element={<WatchPage />} />
      <Route path="/" element={<MainLayout />}>
        <Route index element={<HomePage />} />
        <Route path="browse" element={<BrowsePage />} />
        <Route path="my-lists" element={<MyListsPage />} />
        <Route path="film/:id" element={<FilmDetailPage />} />
        <Route path="anime" element={<AnimeDetailPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
