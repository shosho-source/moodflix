# 🏴‍☠️ Movie Cine (TMDB + The Cine Bay)

> **The Movie Database (TMDB) Ratings meets The Cine Bay Torrents.**  
> A simple, modern, zero-native-dependency movie discovery & torrent automation engine in pure JavaScript (Node.js).

---

## ⚡ Highlights

- **Pure Modern JavaScript**: Fast, clean ES modules with zero heavy native C-extension compilers or brittle gemsets.
- **TMDB Live Movie Engine**: Trending, top-rated, and popular movies with genuine TMDB IDs, star ratings (e.g. `★ 8.4/10`), vote counts, genres, posters, and synopsis.
- **Optional TMDB API Key**: Works immediately out of the box with built-in curated feeds, or enter your personal TMDB v3 API Key in Settings for unlimited live searches.
- **The Cine Bay API Integration**: Searches `apibay.org` JSON API directly with multi-source fallbacks (YTS / magnet generators).
- **Smart Quality Ranker**: Evaluates video resolution (4K UHD > 1080p > 720p), seed health, VIP/Trusted uploaders, audio codecs (x265, 5.1/7.1 Atmos), and penalizes CAM/screeners.
- **NameCleaner**: Advanced regex sanitizer that strips release tags, codecs, release groups, and punctuation for high-precision title matching.
- **Modern Web Dashboard**: Features real-time rating sliders, live search, dark glassmorphic UI, and 1-click torrent downloads.
- **Watch Directory Automation**: Automatically writes `.magnet` and `.info.json` files to your watch folder (compatible with qBittorrent, Transmission, Deluge, Torrent clients) and optional direct magnet client launch.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Interactive Web Dashboard
```bash
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---



---

## 🧪 Running Tests

Run the built-in Node.js test suite:

```bash
npm test
```
