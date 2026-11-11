# NaoFlix

NaoFlix is a multi-source streaming and reading app for Android, built with React Native and Expo. It aggregates anime, donghua, films/series, manga/comics, and web novels from third-party sources into a single app with social features, a community forum, synchronized watch parties (Nobar), offline anime downloads, and a built-in leveling system.

This is a non-commercial, solo-developer project built primarily as a learning exercise in mobile development.

## Features

**Streaming and Reading**
- Native video player (`expo-video`) with Picture-in-Picture and background playback for anime and downloaded episodes
- Built-in WebView film player with popup, redirect, and overlay ad-blocking for LK21 films and TV series
- Multi-resolution playback and server switching across supported sources
- Offline anime downloads with pause/resume, automatic retry on reconnect, local playback, and `.nomedia` hiding from Android gallery
- Fullscreen manga/comic reader and local `.cbz` file reader
- Web novel reader with adjustable font size
- Weekly anime release schedule (`AnimeSchedulePage`)
- Bilingual UI support (Indonesian / English), switchable in Settings

**Social and Community**
- Google Sign-In authentication via Supabase
- Customizable user profiles with avatar and banner (static images and animated GIFs), bio, and activity stats
- Community Forum with text, image/GIF (up to 4 items), poll, review rating, Nobar room, and link posts, plus nested replies, votes, bookmarks, spoiler/NSFW tags, reporting, and user blocking
- Real-time Direct Messaging (DM) with request preview-before-accept flow and Nobar invite cards
- Global floating chat forum and per-title comment sections
- Discord-style rich presence ("Currently watching ...")

**Watch Party (Nobar)**
- Free, unlimited real-time synchronized playback via Supabase Realtime for anime and films
- Host controls with guest auto-sync and auto-pause on episode switch
- In-room live chat and deep-linkable room invites via DM (`naoflix://nobar/<roomId>`)
- 15-second disconnect tolerance before leaving/closing a room

**Gamification and Other**
- EXP earned from watching, reading, and forum participation with level/rank badges synced to Supabase and local fallback
- Extension Manager to switch or toggle sources (`OtakuDesu`, `Nimegami`, `LK21`, `Komiku`, `Komikindo`, `MyNimeku`, `Bacakomik`, `Shinigami`, `Luvyaa`, `Voratoon`) alongside Donghua (`Anichin`) and Web Novels (`Meionovel`)
- Cloudflare bypass WebView for protected sites and Remote Config domain overrides (`scraper_config.json`)
- Dark and light themes
- Local JSON backup and restore (watch history, watch later, downloads metadata, language, and extension preferences)
- Push notifications via OneSignal and manual/OTA update checks

## Tech Stack

- **Framework:** React Native 0.81 + Expo 54 (New Architecture & React Compiler enabled)
- **Language:** TypeScript
- **Backend:** Supabase (Auth, Postgres, Realtime, Storage, Edge Functions)
- **UI:** React Native Paper (Material Design 3)
- **Navigation:** React Navigation (native stack, bottom tabs, drawer)
- **State & Storage:** React Context + AsyncStorage + `expo-sqlite` + `react-native-blob-util`
- **Video:** `expo-video` (native player) + `react-native-webview` (embedded streams)
- **Animations:** React Native Reanimated 4
- **Lists:** FlashList, LegendList
- **Scraping:** Cheerio, `node-html-parser`, Axios
- **Notifications:** OneSignal

## Prerequisites

- **Node.js:** v20 or later
- **Yarn 3.8.2 via Corepack:** This repository uses Yarn Berry (`nodeLinker: node-modules` in `.yarnrc.yml`) and relies on Yarn `resolutions` / patches inside `.yarn/patches/`. Do **not** use `npm install` (run `corepack enable` before installing).

- **JDK:** 17
- **Android SDK & NDK (must match `android/build.gradle`):**
  - `compileSdkVersion` / `targetSdkVersion`: **36**
  - `buildToolsVersion`: **36.0.0**
  - `ndkVersion`: **27.1.12297006**
  - `minSdkVersion`: **24**
- **Supabase project** (for auth, social features, Nobar realtime sync, forum, and media storage)
- **Firebase project** with Android app configured (for `google-services.json` and Google Sign-In)

## Setup

1. **Clone the repository:**

```bash
git clone https://github.com/Naotica2/naoflix.git
cd naoflix
```

2. **Install dependencies with Yarn:**

```bash
corepack enable
yarn install
```

3. **Create `.env` in the project root:**

```bash
cp .example.env .env
```

Fill in the values (`react-native-dotenv` bundles `.env` at JS build time; if you change `.env`, restart Metro with `--reset-cache` or rebuild):

```env
# Required for Auth, Cloud Sync, Nobar, DM, Comments, and Forum
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Required for Google Sign-In
GOOGLE_WEB_CLIENT_ID=your_google_web_client_id_here

# Optional: OneSignal Push Notifications (safely skipped if invalid/unset)
ONESIGNAL_APP_ID=your_onesignal_app_id_here

# Optional: Discord webhook URL for the ErrorBoundary "Report Error" button
WEBHOOK_REPORT_ERROR=your_discord_webhook_url_here
```

4. **Set up Firebase & Android Signing:**

- In Firebase Console, create an Android app using package name **`com.pirles.anime`** (from `android/app/build.gradle`), or update `applicationId` / `namespace` / Kotlin packages first if you are rebranding.
- Register the **SHA-1** fingerprint of your debug or release keystore in Firebase Console (required for Google Sign-In; missing SHA-1 causes `DEVELOPER_ERROR`).
- Download `google-services.json` and place it at:

```text
android/app/google-services.json
```

- **Keystore:** Debug builds and fallback local release builds already work out of the box using the included `android/app/debug.keystore`. If you want to sign release APKs with your own production key, generate `android/app/my-upload-key.keystore` and create/update `android/gradle.properties`:

```properties
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=2048m
org.gradle.parallel=true
android.useAndroidX=true
reactNativeArchitectures=armeabi-v7a,arm64-v8a
newArchEnabled=true
hermesEnabled=true
edgeToEdgeEnabled=true

MYAPP_UPLOAD_STORE_FILE=my-upload-key.keystore
MYAPP_UPLOAD_KEY_ALIAS=my-key-alias
MYAPP_UPLOAD_KEY_PASSWORD=your_keystore_password
MYAPP_UPLOAD_STORE_PASSWORD=your_store_password
```

5. **Configure Android SDK location (`android/local.properties`):**

```properties
sdk.dir=/path/to/your/Android/Sdk
```

6. **Set up your own Supabase backend (for forks / self-hosting):**

If you connect your own Supabase project, set it up in this order:

- **Step A — Run SQL schemas in Supabase Dashboard -> SQL Editor (in exact order):**
  1. `supabase/core_schema.sql` (creates `profiles`, `follows`, `watch_history`, `comments`, `chat_messages`, `dm_channels`, `dm_messages`, RLS policies, `avatars`/`banners` Storage buckets, and Realtime publication)
  2. `supabase/forum_schema.sql` (creates `forum_*` tables, `user_blocks`, triggers, RLS policies, feed/comment RPCs, and the `forum-media` Storage bucket)
  3. `supabase/disk_io_optimization.sql` (adds trigram/composite indexes and the `get_dm_channel_previews()` RPC)
- **Step B — Enable Google Auth Provider:**
  In **Supabase Dashboard -> Authentication -> Providers -> Google**, enable Google Sign-In using your Google OAuth Web Client ID.
- **Step C — Optional ImageKit Edge Function:**
  Deploy `supabase/functions/forum-media-sign/index.ts` and configure `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_PUBLIC_KEY`, and `IMAGEKIT_URL_ENDPOINT` in Supabase Edge Function secrets if you want ImageKit signed uploads. If omitted, forum image uploads fall back automatically to the Supabase `forum-media` bucket.

## Forking & Rebranding Notes

If you are creating an independent fork, review and replace these upstream references before releasing your own build:

- **Remote Config & Domain Fallback:** `CONFIG_URL` in `src/utils/remoteConfig.ts` points to `Naotica2/naoflix/main/scraper_config.json`, and `src/utils/scrapers/animeindo.ts` fetches fallback domains from `Naotica2/naoflix` / `AniFlix`.
- **In-App Announcements & Update Checks:** `src/component/misc/Announcement.tsx`, `src/component/Loading Screen/Connect.tsx`, and `src/component/NeedAttention/FailedToConnect.tsx` point to `Naotica2/naoflix` for `Announcement.md`, GitHub Releases, and Issues.
- **Expo Updates / EAS Project ID:** `app.json` and `android/app/src/main/AndroidManifest.xml` contain the upstream EAS project ID (`u.expo.dev/ccdabe85-...`). Remove or replace it with your own Expo project ID if you use EAS Updates.
- **Android Application ID & Deep Links:** Update `com.pirles.anime` (`android/app/build.gradle`) and custom URL schemes (`naoflix://`, `aniflix://` in `App.tsx` and `AndroidManifest.xml`) if needed.

## Running and Building

Start Metro bundler:

```bash
yarn start
```

Run debug build on a connected Android device/emulator:

```bash
yarn android
```

Build release APK:

```bash
yarn release
```

The Gradle release build outputs `android/app/build/outputs/apk/release/anime-release.apk` (configured via `archivesBaseName = "anime"` in `android/app/build.gradle`). To rename and install it using the helper scripts in `package.json`:

```bash
yarn rename
yarn installapk
```

## Project Structure

```text
naoflix/
  App.tsx                  # Root component, navigation stack, linking, providers
  Announcement.md          # Remote-fetched in-app announcement markdown
  CHANGELOG.md             # Release changelog
  scraper_config.json      # Remote domain overrides for LK21
  src/
    assets/                # Themes, global styles, pro tips, logo assets
    component/             # UI components (Home, EpisodeDetail, WatchNRead, Forum, Profile, etc.)
    config/                # Supabase client & Database TypeScript types
    hooks/                 # Custom hooks (watch party sync, back handler)
    misc/                  # AuthContext, LevelContext, LanguageContext, navigation service
    screens/               # Full-page screens (Login, Profile, DM, Forum, JoinNobar, etc.)
    types/                 # TypeScript type definitions
    utils/                 # API layers, download manager, database, presence, remote config
      scrapers/            # Individual site scrapers (animeSeries, nimegami, lk21, anichin, komiku, etc.)
  android/                 # Native Android project
  supabase/                # Core, Forum & Disk IO SQL scripts and forum-media-sign Edge Function
```

## Disclaimer

NaoFlix does not host, store, or have any control over the video, manga, or novel content displayed within the app. All media is fetched from publicly available third-party sources on the internet. The developer is not responsible for any misuse of this application or any copyright infringement by its users.

All trademarks, titles, and artwork belong to their respective copyright holders. Please support official streaming platforms like Crunchyroll, Netflix, and others.

## Acknowledgments

NaoFlix is a fork of [AniFlix](https://github.com/FightFarewellFearless/AniFlix) by FightFarewellFearless, originally licensed under MIT. See `LICENSE-Aniflix.txt` for the original license.

## License

This project is licensed under the GNU General Public License v3.0. See `LICENSE` for details.
