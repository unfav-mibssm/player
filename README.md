# StreamVault — Cinematic Video Player

A premium, mobile-first streaming video player website. Paste any direct video URL and stream it instantly inside a cinematic player UI.

**Live branding:** `player.mibsam.online`

---

## ✨ Features

- **Formats:** MP4, MKV, M3U8/HLS
- **Codecs:** H.264 (full), HEVC/x265 (browser-dependent), 10-bit (browser-dependent)
- **HLS streaming** via HLS.js with adaptive bitrate
- **Native HLS** on Safari/iOS
- **Double-tap seek** gestures (mobile)
- **Playback speed** control (0.25× – 2×)
- **Picture-in-Picture** support
- **Fullscreen** with landscape lock on mobile
- **Auto-hide controls** during playback
- **Resume playback** — remembers position via localStorage
- **Multiple audio tracks** (HLS and native)
- **Subtitles:** .srt, .vtt upload + native track support
- **Subtitle customization:** size, opacity, background
- **Keyboard shortcuts** (desktop)
- **Buffering indicator** with cinematic spinner
- **Codec detection** with user-friendly error messages
- **Dark cinematic UI** with glassmorphism effects
- **No backend** — fully static frontend

---

## 🗂 Project Structure

```
streamvault/
├── index.html          ← App shell, HTML structure
├── css/
│   ├── style.css       ← Global styles, hero, layout, fonts
│   ├── player.css      ← Player controls, overlays, gestures
│   └── menus.css       ← Floating menus, subtitle overlay
├── js/
│   ├── utils.js        ← Shared utility functions
│   ├── subtitles.js    ← SRT/VTT parser and renderer
│   ├── player.js       ← Core player (HLS, controls, keyboard, gestures)
│   └── script.js       ← App orchestration, URL input, navigation
└── README.md
```

---

## 🚀 Deployment to GitHub Pages

### Method 1: GitHub Web UI

1. Create a new repository on GitHub (e.g. `streamvault`)
2. Upload all files maintaining the folder structure:
   - `index.html` at root
   - `css/` folder with 3 CSS files
   - `js/` folder with 4 JS files
3. Go to **Settings → Pages**
4. Under **Source**, select `main` branch and `/ (root)` folder
5. Click **Save**
6. Your site will be live at `https://yourusername.github.io/streamvault/`

### Method 2: GitHub CLI / Git

```bash
# Clone or init repo
git init streamvault
cd streamvault

# Copy all project files here, then:
git add .
git commit -m "Initial StreamVault deployment"
git branch -M main
git remote add origin https://github.com/YOURUSERNAME/streamvault.git
git push -u origin main

# Enable GitHub Pages via Settings → Pages → main branch → Save
```

### Method 3: GitHub Desktop

1. Create new repository in GitHub Desktop
2. Copy all files into the repository folder
3. Commit and push to GitHub
4. Enable Pages in repository Settings

---

## 🌐 Custom Domain (Optional)

To use `player.mibsam.online`:

1. In your DNS provider, add a CNAME record:
   - Name: `player`
   - Value: `yourusername.github.io`
2. In GitHub repo **Settings → Pages → Custom domain**, enter `player.mibsam.online`
3. Check **Enforce HTTPS**

---

## 🎮 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` / `K` | Play / Pause |
| `←` Arrow | Rewind 10s |
| `→` Arrow | Forward 10s |
| `↑` Arrow | Volume up |
| `↓` Arrow | Volume down |
| `M` | Mute toggle |
| `F` | Fullscreen toggle |
| `P` | Picture-in-Picture |
| `Esc` | Exit fullscreen |

---

## 📱 Mobile Gestures

| Gesture | Action |
|---------|--------|
| Double-tap left | Rewind 10s |
| Double-tap right | Forward 10s |
| Single tap | Show/hide controls |
| Tap play/pause | Play or pause |

---

## 🎬 Codec Support

| Codec | Support |
|-------|---------|
| H.264/AVC | ✅ All browsers |
| H.265/HEVC | ⚠️ Safari, Edge, some Chrome |
| VP9 | ✅ Chrome, Firefox |
| AV1 | ✅ Modern browsers |
| 10-bit | ⚠️ Browser-dependent |
| MKV container | ⚠️ Limited (browser codec must match) |

> **Note:** HEVC/x265 and 10-bit playback depends entirely on your browser and OS codec support. Chrome on Android typically supports H.264 only. Safari on iOS/macOS supports HEVC hardware decoding.

---

## 🔒 Privacy

- No data is sent to any server
- Video is streamed directly from the URL you provide
- Playback position is saved in your browser's `localStorage` only
- No analytics, no cookies, no tracking

---

## 📦 Dependencies (CDN — no install needed)

- **HLS.js** v1.5.7 — HLS streaming support
- **Google Fonts** — DM Sans + Syne typography

All dependencies load from CDN. No `npm install` required.

---

## 🛠 Local Development

Simply open `index.html` in a browser:

```bash
# Using Python
python3 -m http.server 8080

# Using Node.js
npx serve .

# Or just open index.html directly in Chrome/Firefox
```

> Some HLS streams may require a local server due to CORS. Use `npx serve .` for best results.
