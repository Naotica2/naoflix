# NaoFlix

NaoFlix is a multi-source streaming and reading app for Android, built with React Native and Expo. It aggregates anime, films, manga, and web novels from various third-party providers into a single interface with social features, watch parties, and a built-in leveling system.

This is a non-commercial, solo-developer project built primarily as a learning exercise in mobile development.

## Features

**Streaming and Reading**
- Watch anime and films with a native video player (HLS and MP4, not WebView-based)
- Multi-resolution support with server switching
- Read manga and comics from multiple sources with a fullscreen reader
- Read web novels with adjustable font size
- Subtitle support for films (multi-language, Indonesian default)
- CBZ file reader for locally stored comics

**Social**
- Google Sign-In authentication via Supabase
- User profiles with avatar, banner (GIF supported), bio, and activity stats
- Follow/unfollow system
- Real-time direct messaging with invite/accept flow
- Public chat forum with anti-spam cooldown
- Comment sections on all content pages
- Discord-style rich presence ("Currently watching One Piece")

**Watch Party (Nobar)**
- Real-time synchronized playback with friends
- Host controls with guest auto-sync
- In-room live chat
- Invite links shareable through DM
- 15-second disconnect tolerance before kick

**Gamification**
- XP earned from watching and reading
- Level and rank system (Common through Legendary)
- Stats synced to Supabase with local fallback

**Other**
- Pluggable extension system for content sources
- Genre browsing and search across all content types
- Watch history and watch later lists
- OTA updates via Expo Updates
- Push notifications via OneSignal
- Dark and light theme support
- Cloudflare bypass for protected sources

## Tech Stack

- **Framework:** React Native 0.81 + Expo 54
- **Language:** TypeScript
- **Backend:** Supabase (Auth, Database, Realtime, Edge Functions)
- **Payment Backend:** Vercel Serverless Functions
- **UI:** React Native Paper (Material Design 3)
- **Navigation:** React Navigation (native stack, bottom tabs, drawer)
- **State:** React Context + AsyncStorage + expo-sqlite
- **Video:** expo-video (native player with PiP and background playback)
- **Animations:** React Native Reanimated 4
- **Lists:** FlashList, LegendList
- **Scraping:** Cheerio, Axios
- **Notifications:** OneSignal

## Prerequisites

- Node.js 20 or later
- Yarn 3.x (the repo uses Yarn Berry with PnP disabled)
- Android SDK (API 34 or later recommended)
- JDK 17
- A Supabase project with the required tables (see `src/config/supabaseClient.ts` for the schema)
- A Firebase project for Google Sign-In (to generate `google-services.json`)

## Setup

1. Clone the repository:

```bash
git clone https://github.com/Naotica2/naoflix.git
cd naoflix
```

2. Install dependencies:

```bash
yarn install
```

3. Create a `.env` file in the project root. Use `.example.env` as a reference:

```bash
cp .example.env .env
```

Then fill in your actual values:

```
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
ONESIGNAL_APP_ID=your_onesignal_app_id_here
GOOGLE_WEB_CLIENT_ID=your_google_web_client_id_here
EXPO_PUBLIC_COVENANT_API_KEY=your_covenant_api_key_here
```

4. Place your Firebase config and signing keystore:

```
android/app/google-services.json
android/app/my-upload-key.keystore
```

5. Create `android/gradle.properties` with your keystore credentials:

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

6. Make sure `android/local.properties` points to your Android SDK:

```
sdk.dir=/path/to/your/Android/Sdk
```

## Running

**Development build:**

```bash
yarn android
```

**Release APK:**

```bash
yarn release
```

The output APK will be at `android/app/build/outputs/apk/release/`.

## Project Structure

```
naoflix/
  App.tsx                  # Root component, navigation, providers
  src/
    component/             # UI components (Home, EpisodeDetail, WatchNRead, etc.)
    config/                # Supabase client setup
    hooks/                 # Custom hooks (watch party, back handler)
    misc/                  # Auth context, level context, navigation service
    screens/               # Full-page screens (Login, DM, Profile, etc.)
    types/                 # TypeScript type definitions
    utils/                 # Scrapers, database manager, API layer
      scrapers/            # Individual source scrapers (otakudesu, moviebox, etc.)
  android/                 # Native Android project
  pg-backend/              # Vercel serverless functions (payment gateway)
  supabase/                # Edge functions and migrations
```

## Disclaimer

NaoFlix does not host, store, or have any control over the video, manga, or novel content displayed within the app. All media is fetched from publicly available third-party sources on the internet. The developer is not responsible for any misuse of this application or any copyright infringement by its users.

All trademarks, titles, and artwork belong to their respective copyright holders. Please support official streaming platforms like Crunchyroll, Netflix, and others.

## Acknowledgments

NaoFlix is a fork of [AniFlix](https://github.com/FightFarewellFearless/AniFlix) by FightFarewellFearless, originally licensed under MIT. See `LICENSE-Aniflix.txt` for the original license.

## License

This project is licensed under the GNU General Public License v3.0. See `LICENSE` for details.
