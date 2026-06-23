# Changelog NaoFlix

## [v2.0.2] - Quality of Life & Fixes
### Changed
- **Rounded Episode Navigation:** Desain navigasi pindah episode kini diperbarui dengan gaya membulat (*rounded*) agar terlihat lebih dinamis dan konsisten dengan tema aplikasi.
- **Continue Watching Update:** Daftar "Lanjutkan Menonton" di beranda kini difilter khusus untuk Anime dan Film saja, dan telah dilengkapi dengan informasi sisa durasi dari tontonan terakhir (*last duration*).
- **Draggable Chat Forum:** Tombol *floating* untuk fitur Forum Chat kini bersifat dinamis dan dapat digeser secara bebas agar tidak menghalangi layar.

### Added
- **Fullscreen Episode Navigation:** Menambahkan tombol *Next* dan *Prev* secara langsung di dalam pemutar video layar penuh (*fullscreen*). Berlaku untuk Anime dan Film (TV Series). Tombol akan otomatis nonaktif / meredup jika video yang ditonton adalah episode pertama atau episode terakhir.

### Fixed
- **Shinigami Genre Navigation:** Memperbaiki bug pada ekstensi Shinigami di mana sebelumnya pengguna tidak bisa mengakses halaman "Lihat Lebih Banyak" saat menggunakan pencarian berdasarkan genre.
- **Film History Playback:** Memperbaiki error pada pemutar Film (baik *Movie* maupun *Series*) yang sebelumnya gagal memutar ulang (*rewatch*) video ketika diakses melalui halaman Histori ataupun Tonton Nanti.
- **Account Data Persistence:** Memperbaiki bug kritis di mana progress level dan EXP akun akan ter-reset ke level 1 jika pengguna menghapus data aplikasi (*clear data*).
- **TV Series Metadata Bug:** Memperbaiki masalah pada serial TV yang terdeteksi sebagai *Movie* saat tersimpan di daftar Tonton Nanti atau Histori, sehingga fitur pemilihan *season* dan episode kini tetap dapat diakses.
- **Accurate History Tags:** Mengoreksi tag label pada halaman histori agar secara tepat menampilkan "TV Series" dengan warna oranye untuk tipe serial, bukan lagi disamaratakan sebagai "Movie".
- **Animelovers Latest Episodes:** Memperbaiki tombol "Lihat Semua" pada bagian Episode Terbaru untuk ekstensi Animelovers yang sebelumnya tidak bisa menampilkan halaman selanjutnya (*pagination*).
- **Fullscreen Crash Fix:** Memperbaiki *bug fatal (invariant violation)* yang menyebabkan aplikasi *crash* atau tertutup sendiri saat pengguna masuk ke mode layar penuh (*fullscreen*) akibat perubahan jumlah kolom layar secara dinamis.
- **Komikcast Image Loading:** Menuntaskan masalah halaman komik dari ekstensi Komikcast yang kosong (*blank*) dengan menyesuaikan *referer* pada sistem pemutar komik bawaan.
- **Animelovers Genre Filtering:** Memperbaiki menu "Lihat Lebih Banyak" dari Animelovers yang sebelumnya memunculkan hasil acak dengan menonaktifkan fitur pencarian genre yang memang tidak didukung oleh API aslinya.

### Removed
- **Oploverz Deprecation:** Menghapus ekstensi anime Oploverz secara permanen dari dalam aplikasi karena server tidak lagi stabil dan sering mengalami gangguan API.

## [v2.0.1] - Film, Chat Forum & More
### Added
- **add film:** Menambahkan fitur nonton film/series dari movie-box.co dengan streaming MP4 native, subtitle multi-bahasa (termasuk Indonesian), dan navigasi episode TV.
- **add film search:** Pencarian film/series di tab Browse dengan hasil berupa poster, rating IMDB, badge Movie/TV, dan navigasi langsung ke halaman detail.
- **add film detail page:** Halaman detail film dengan metadata lengkap (sinopsis, genre, tahun, rating IMDB), pemilih server, dan pemilih bahasa subtitle.
- **add film player:** Pemutar film native MP4 (bukan WebView) dengan switcher resolusi, subtitle picker (Indonesian default), navigasi episode TV, kolom komentar, dan fullscreen support.
- **add film terbaru:** Section "Film Terbaru" di halaman Home dengan data trending dan halaman "Lihat Semua" dengan grid layout dan pagination.
- **add film exp:** Nonton film/series memberikan EXP (+25 EXP). Film 1x, series setiap episode baru.
- **add chat forum:** Forum chat real-time untuk sesama member yang login. Fitur: floating button, badge unread, cooldown 5 detik anti-spam, deteksi emoji, dan avatar profil.
- **add shinigami comic:** Ekstensi komik baru Shinigami dengan fitur rilis terbaru, rekomendasi, pencarian, detail, dan reader. Bisa diaktifkan di pengaturan ekstensi.
- **add komikcast comic:** Ekstensi komik baru Komikcast dengan koleksi Manga, Manhwa, dan Manhua terlengkap. Fitur rilis terbaru, populer, pencarian, detail, dan reader. Bisa diaktifkan di pengaturan ekstensi.
### Fixed
- **fix weekly schedule:** Jadwal rilis mingguan kini menampilkan semua hari (Senin-Minggu) dengan benar dari semua sumber anime. Sebelumnya hanya menampilkan hari tertentu saja.
- **fix level reset on logout:** Progress level dan EXP tidak lagi reset saat logout atau hapus data. Data EXP kini tersinkronisasi ke Supabase dengan retry 3x dan disimpan di penyimpanan lokal sebagai cadangan.

---
## [v2.0.0] - Crunchyroll-Style Overhaul & Multi-Source
### Added
- **Crunchyroll-Style UI/UX:** Perombakan total tampilan dan navigasi mengikuti gaya Crunchyroll. Bottom tab berubah dari 6 tab menjadi 4 tab: **Home**, **Browse**, **My Lists**, dan **Account**.
- **Hero Carousel:** Banner anime unggulan di halaman utama dengan auto-scroll, gradient overlay, dan tombol "Tonton".
- **Continue Watching:** Baris khusus di Home yang menampilkan anime yang sedang kamu tonton beserta progress-nya.
- **Browse Page:** Halaman baru untuk eksplorasi konten dengan chip filter tipe konten (Anime/Komik/Novel), genre chips, dan pencarian terpusat.
- **My Lists Page:** Menggabungkan Riwayat dan Tonton Nanti dalam satu halaman dengan segment tab. Desain card baru dengan thumbnail dan info episode.
- **Account Page:** Profil header dengan avatar, level, rank badge, dan EXP bar. Menu pengaturan dalam bentuk list yang lebih rapi.
- **New Anime Source — Animelovers:** Pengganti Kuramanime. API streaming anime terbaru menggunakan Animelovers (api.fruatre.my.id) dengan fitur carousel, jadwal, rilis terbaru, dan direct streaming MP4.
- **New Comic Source — MyNimeku:** Alternatif selain Komiku. Koleksi Manga, Manhwa, dan Manhua dengan pencarian dan genre browsing.
- **New Comic Source — Bacakomik:** Tambahan ekstensi komik baru dari Bacakomik (api.fruatre.my.id) dengan fitur pencarian, rilis terbaru, detail, dan reader komik.
- **Read Chapter Indicator:** Chapter yang sudah pernah dibaca tampil lebih redup (abu-abu) dengan label "Dibaca" di daftar chapter komik dan novel.
- **Novel Continue Button:** Muncul otomatis jika kamu pernah membaca novel tersebut, langsung lanjut dari chapter terakhir.
- **Read Progress Bar:** Progress bar biru di thumbnail "Lanjutkan Menonton" menunjukkan seberapa jauh kamu sudah menonton.
### Changed
- **Blue Accent Color:** Keseluruhan warna aksen aplikasi berubah dari oranye (#F47521) menjadi biru (#3b82f6), termasuk tombol, badge, progress bar, link, dan elemen interaktif lainnya.
- **Komik Update Section:** Nama section diganti dari "Manga Update" menjadi "Komik Update".
- **Episode Navigation:** Tombol "Mulai dari Episode 1" dan "Tonton Episode Terbaru" kini bekerja dengan benar (sebelumnya tertukar).
- **Card Spacing:** Jarak antar kartu konten di Home dan halaman "Lihat Semua" kini lebih konsisten dan rapi.
- **Comic Thumbnail:** Thumbnail komik kini menggunakan rasio 1:1.5 (portrait) yang konsisten dengan anime dan novel, tidak lagi gepeng atau terlalu zoom.
- **Novel Chapter List:** Daftar chapter novel kini menggunakan virtualized list (FlashList) — scroll lancar bahkan untuk novel dengan 1000+ chapter.
### Removed
- **Samehadaku:** Sumber anime Samehadaku dihapus karena diblokir Cloudflare dan tidak bisa diakses.
- **Kuramanime & Kuronime:** Sumber anime Kuronime dan Kuramanime dihapus sepenuhnya karena sering error dan tidak stabil.
- **Film Section:** Bagian Film dihapus dari halaman utama karena masih dalam tahap perbaikan.
### Fixed
- **Novel Loading Freeze:** Novel dengan 700+ chapter tidak lagi freeze/loading selamanya. Parser chapter diganti dari regex ke cheerio untuk menghindari *catastrophic backtracking*.
- **Episode Navigation Stuck:** Pindah episode tidak lagi stuck loading. Data state kini tersinkronisasi dengan benar saat navigasi antar episode.
- **MyNimeku Search & Genre:** Pencarian dan genre browsing di MyNimeku kini bekerja dengan benar menggunakan CSS selector yang tepat.
- **Comic Detail Continue Button:** Tombol "Lanjutkan" di detail komik kini muncul untuk kedua sumber (Komiku dan MyNimeku) dengan fuzzy history matching.
- **Animelovers & Bacakomik Fixes:** Memperbaiki 404 Not Found dari Home menuju halaman detail/streaming. Fitur Auto-Search Fallback akan mengatasi link anime lama (slug berbeda) otomatis mencari slug baru. 
- **Pagination Optimization:** Mencegah list duplikat (infinity bug) pada menu Terbaru yang disebabkan oleh server API.
- **Account Page Safe Area:** Profil di halaman Account tidak lagi mentok ke atas layar (status bar).

---
## [v1.3.1] - UI & Navigation Fixes
### Added
- **Genre Page:** Menambahkan halaman khusus "Jelajahi Berdasarkan Genre" untuk Anime dan Komik.
- **History Tags:** Menambahkan tag "Novel" dan "Film" pada riwayat.
### Fixed
- **History Crash:** Memperbaiki bug crash saat melanjutkan film dari riwayat.
- **Comic Thumbnail:** Memperbaiki thumbnail komik yang tidak muncul di riwayat.

---
## [v1.2.9] - Minor Fix
### Fixed
- **Fix Missing Prev/Next Button:** sudah saya fix ygy

---
## [v1.2.8] - Novel & Stability
### Added
- **Novel Page:** Fitur baca novel baru menggunakan sumber MeioNovels. Termasuk pencarian pintar, detail novel, dan reader dengan kontrol ukuran font.
### Fixed
- **Fix Auto-Search:** Pencarian tidak lagi otomatis berjalan saat mengetik. Sekarang hanya aktif saat tekan Enter.

---
## [v1.2.7] - Gamification & UI Modernization
### Added
- **Gamification System:** Tambahan sistem Level, EXP, dan Rank (Common sampai Legendary) yang tersinkronisasi via Database.
- **Leveling Info:** EXP nambah tiap kali nonton anime/movie, atau baca komik. Keterangan level tampil di profil dan kolom komentar.
### Changed
- **Monochrome UI:** Transisi keseluruhan warna aplikasi menjadi gaya monochrome elegan (hitam/putih/abu-abu), tanpa menghilangkan warna asli thumbnail.
- **Anime Movie Optimization:** Menggabungkan sumber Anime Movie langsung ke AnimeAPI untuk mengatasi error dan loading lama.
- **Clean Interface:** Menghilangkan animasi teks berjalan (quotes) yang mengganggu pada halaman utama.

---
## [v1.2.6] - Anime Server Migration
### Changed
- **Anime Server Migration:** Backend anime sepenuhnya pindah dari yang lama. Sekarang lebih stabil, lebih cepat, dan koleksi lebih lengkap.
- **Native Video Player:** Video diputar langsung di Native Player (bukan WebView) lewat ekstraksi HLS dari vidhide dan MP4 dari Blogger/ondesu.
- **Multi-Resolution:** Resolusi otomatis terdeteksi (360p/480p/720p/1080p) dari server ondesu/ondesuhd.
- **Server Switching:** Ganti server streaming (vidhide, ondesu, ondesuhd, filedon, mega) langsung dari dalam player.
- **Legacy URL Support:** Link anime lama tetap bisa dibuka dan otomatis dialihkan ke server anime baru.

---
## [v1.2.5] - Independent Core & Immersive Comics
### Updated
- **Independent System Core:** Migrasi penuh server Anime dan Film dari Sanka API ke scraper bawaan. Lebih stabil dan mandiri.
- **Smarter Search & Thumbnail:** Pencarian anime kini lebih pintar mendeteksi season baru beserta poster aslinya dengan akurat.
- **Anti-Block Video Player:** Bypass blokade Cloudflare di WebView. Nonton webview kini bebas dari error logo Android.
- **Immersive Comic Reader:** Cukup tap layar saat baca komik untuk masuk ke mode fullscreen (tanpa tombol).
- **Clean UI & Comic Fixes:** Poster komik tidak gepeng lagi. Bug tombol navigasi bab selanjutnya telah diperbaiki.

## [v1.2.4] - UI & Navigation Optimization
### Updated
- **New Comic server ( faster than before )**
- **360p Default Player Resolution: Pemutar video kini otomatis di 360p untuk hemat kuota.**
- **Smart Search Reset: Hasil dan input teks pencarian otomatis ter-reset saat pindah tab.**
- **Search History Alignment: Perbaikan posisi riwayat pencarian agar lebih rapi dan presisi.**
- **Comic Thumbnail Fix: Perbaikan rasio thumbnail komik agar tidak terlihat gepeng.**
- **See More Navigation: Penambahan tombol "Lihat Semua" pada bagian Komik Populer dan Film Unggulan.**
- **Tab Data Persistence: Optimasi loading data agar tetap tersimpan saat berpindah tab.**

---
## [v1.2.3] - Donasi dong 
### Added
- **Switching to the new anime series server (beta) it might be a little unstable**
- **Fix the keyboard that covers the comment section while typing**
- **Fixing comic data that isn't loading on the home page**
- **There's more, but I'm too lazy to update the changelog**

---
## [v1.2.2] - Anime Series
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
- First build NaoFlix   ./