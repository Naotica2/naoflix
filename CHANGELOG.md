# Changelog NaoFlix

## [v1.2.2] - Anime Series Update
### Added
- **Peningkatan Server Anime:** Pembaruan sistem pengambilan data khusus kategori Anime Series agar *loading* jauh lebih cepat, stabil, dan koleksi tontonan semakin komplit.
- **Optimasi Pencarian:** Penambahan sistem pintar di kolom pencarian agar hasil tampil lebih mulus dan mencegah *ngelag* atau macet saat mengetik kata kunci.
- **Peningkatan Stabilitas:** NaoFlix kini menampilkan indikator antrean dengan tombol "Coba Lagi" jika sedang terjadi lonjakan penonton, sehingga aplikasi tidak akan sekadar putus koneksi.
- **Dukungan Developer ( donasi button ):** plis donasi ke solo developer ini - naotica ( rashya )

---
## [v1.2.1] - Inherit Update (Authentication & Community)
### Added
- **Autentikasi Google (Google Sign-In):** Sistem *login* aman yang terintegrasi penuh dengan Supabase Auth.
- **Registrasi Username (Permanen):** Konfigurasi *username* khusus (satu kali) setelah registrasi, lengkap dengan validasi dan cek duplikasi real-time.
- **Perubahan pada Profil (Letterboxd Style):** Perombakan UI menu profil ("Saya") dengan menampilkan foto profil Google, *@username*, dan statistik aktivitas menonton (Riwayat & Tonton Nanti).
- **Sistem Komunikasi (Komentar & Balasan):** Penambahan kolom *Comment Section* eksklusif di halaman Anime, Film, dan Movie.
- **Moderasi Otomatis (Anti-Spam):** Pencegahan *spam* berbasis API dengan *cooldown* interval 30 detik untuk setiap komentar.
- **Sistem Push Notification:** Integrasi *OneSignal* SDK sebagai fondasi notifikasi aplikasi.

---
## [v1.2.0] - Initial Release
- First build NaoFlix   