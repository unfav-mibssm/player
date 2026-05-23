/* ============================================
   StreamVault — script.js
   App orchestration: URL input, navigation,
   error display, file uploads, app state
   ============================================ */

'use strict';

const StreamApp = (() => {

  // ─── DOM ────────────────────────────────────────────────────────
  const heroSection    = document.getElementById('hero');
  const playerSection  = document.getElementById('player-section');
  const urlInput       = document.getElementById('video-url-input');
  const playBtn        = document.getElementById('play-btn');
  const clearBtn       = document.getElementById('clear-btn');
  const errorBanner    = document.getElementById('error-banner');
  const errorText      = document.getElementById('error-text');
  const errorClose     = document.getElementById('error-close');
  const siteHeader     = document.getElementById('site-header');
  const siteFooter     = document.getElementById('site-footer');
  const subtitleInput  = document.getElementById('subtitle-file-input');

  // ─── State ──────────────────────────────────────────────────────
  let isPlayerActive = false;

  // ─── Init ───────────────────────────────────────────────────────
  function init() {
    Player.init();

    // Expose app to player for callbacks
    window.StreamApp = { showError, returnToHero };

    // Restore last URL if any
    const lastUrl = Utils.Storage.get('sv_last_url');
    if (lastUrl) {
      urlInput.value = lastUrl;
      clearBtn.classList.add('visible');
    }

    bindEvents();
  }

  // ─── Events ─────────────────────────────────────────────────────
  function bindEvents() {
    // Play button
    playBtn.addEventListener('click', handlePlay);

    // Enter key in input
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handlePlay();
    });

    // Input change → show/hide clear btn
    urlInput.addEventListener('input', () => {
      clearBtn.classList.toggle('visible', urlInput.value.length > 0);
      hideError();
    });

    // Paste event
    urlInput.addEventListener('paste', () => {
      setTimeout(() => {
        clearBtn.classList.toggle('visible', urlInput.value.length > 0);
        if (urlInput.value.trim().length > 10) {
          // Auto-play on paste if looks like a URL
          if (isValidUrl(urlInput.value.trim())) {
            handlePlay();
          }
        }
      }, 50);
    });

    // Clear button
    clearBtn.addEventListener('click', () => {
      urlInput.value = '';
      clearBtn.classList.remove('visible');
      urlInput.focus();
      hideError();
    });

    // Error close
    errorClose.addEventListener('click', hideError);

    // Subtitle file input
    subtitleInput.addEventListener('change', handleSubtitleFile);

    // Handle back/forward browser navigation
    window.addEventListener('popstate', (e) => {
      if (isPlayerActive && !e.state?.player) {
        returnToHero();
      }
    });
  }

  // ─── Handle Play ────────────────────────────────────────────────
  function handlePlay() {
    const raw = urlInput.value.trim();
    if (!raw) {
      showError('Please paste a video URL to continue.');
      urlInput.focus();
      return;
    }

    if (!isValidUrl(raw)) {
      showError('That doesn\'t look like a valid URL. Make sure it starts with http:// or https://');
      return;
    }

    hideError();
    Utils.Storage.set('sv_last_url', raw);

    // Set button loading state
    playBtn.classList.add('loading');
    playBtn.innerHTML = '<span class="play-btn-icon">⏳</span><span>Loading…</span>';

    // Show player after brief delay for animation
    setTimeout(() => {
      showPlayer();
      Player.load(raw);
      playBtn.classList.remove('loading');
      playBtn.innerHTML = '<span class="play-btn-icon">▶</span><span>Play Video</span>';
    }, 120);

    // Push history state so back button works
    history.pushState({ player: true, url: raw }, '', '#player');
  }

  // ─── URL Validation ─────────────────────────────────────────────
  function isValidUrl(str) {
    try {
      const u = new URL(str);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }

  // ─── Section Transitions ────────────────────────────────────────
  function showPlayer() {
    isPlayerActive = true;
    heroSection.classList.add('hidden');
    siteFooter.classList.add('hidden');
    playerSection.classList.remove('hidden');
    playerSection.classList.add('active');

    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Update header
    siteHeader.style.opacity = '0';
    setTimeout(() => {
      siteHeader.style.transition = 'opacity 0.3s ease';
      siteHeader.style.opacity = '1';
    }, 300);
  }

  function returnToHero() {
    isPlayerActive = false;
    playerSection.classList.add('hidden');
    playerSection.classList.remove('active');
    heroSection.classList.remove('hidden');
    siteFooter.classList.remove('hidden');
    document.body.classList.remove('fullscreen-active');

    Player.destroy();

    // Pop history state if needed
    if (location.hash === '#player') {
      history.back();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ─── Subtitle File Handling ─────────────────────────────────────
  async function handleSubtitleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.toLowerCase().split('.').pop();
    if (!['srt', 'vtt'].includes(ext)) {
      showError('Only .srt and .vtt subtitle files are supported.');
      return;
    }

    try {
      const count = await SubtitleManager.loadFromFile(file);
      if (isPlayerActive) {
        Player.addExternalSubtitles();
        // Auto-enable loaded subtitles
        const subItems = document.getElementById('subtitle-items');
        const fileItem = subItems?.querySelector('[data-idx="file"]');
        if (fileItem) fileItem.click();
      } else {
        showNotification(`Subtitle loaded: ${count} cues. Start video to use it.`);
      }
    } catch (err) {
      showError('Subtitle error: ' + err);
    }

    // Reset input so same file can be loaded again
    e.target.value = '';
  }

  // ─── Error / Notification Display ───────────────────────────────
  function showError(msg) {
    errorText.textContent = msg;
    errorBanner.classList.remove('hidden');
    // Auto-hide after 8 seconds
    clearTimeout(errorBanner._timer);
    errorBanner._timer = setTimeout(hideError, 8000);
  }

  function hideError() {
    errorBanner.classList.add('hidden');
  }

  function showNotification(msg) {
    // Temporarily repurpose error banner in gold style
    errorBanner.style.borderColor = 'rgba(232,184,109,0.3)';
    errorBanner.style.background = 'rgba(232,184,109,0.08)';
    errorBanner.style.color = 'var(--c-accent)';
    errorText.textContent = msg;
    errorBanner.classList.remove('hidden');

    clearTimeout(errorBanner._timer);
    errorBanner._timer = setTimeout(() => {
      hideError();
      // Reset styles
      errorBanner.style.borderColor = '';
      errorBanner.style.background = '';
      errorBanner.style.color = '';
    }, 4000);
  }

  return { init, showError, returnToHero };

})();

// ─── Bootstrap ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  StreamApp.init();
});
