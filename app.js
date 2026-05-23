'use strict';

/* ════════════════════════════════════════════
   APP.JS — Orchestrator
   Manages: home ↔ player navigation,
   URL input, subtitle file loading,
   error display, browser back button
   ════════════════════════════════════════════ */

const App = (() => {

  /* ── DOM ── */
  const homeScreen   = document.getElementById('home-screen');
  const playerScreen = document.getElementById('player-screen');
  const urlInput     = document.getElementById('url-input');
  const urlClear     = document.getElementById('url-clear');
  const playBtn      = document.getElementById('play-btn');
  const subFileInput = document.getElementById('sub-file-input');
  const subBadge     = document.getElementById('sub-loaded-badge');
  const subBadgeTxt  = document.getElementById('sub-badge-text');
  const subRemove    = document.getElementById('sub-remove');
  const homeError    = document.getElementById('home-error');
  const homeErrTxt   = document.getElementById('home-error-text');

  /* ── State ── */
  let _playerActive = false;
  let _errTimer     = null;

  /* ════ INIT ════ */
  function init() {
    Player.init();
    window.App = { showHome };

    // Restore last URL
    const last = U.LS.get('mb_last_url');
    if (last) { urlInput.value = last; urlClear.classList.add('show'); }

    bindHome();
    bindBrowserBack();
  }

  /* ════ HOME BINDINGS ════ */
  function bindHome() {
    playBtn.addEventListener('click', handlePlay);

    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handlePlay();
    });

    urlInput.addEventListener('input', () => {
      urlClear.classList.toggle('show', urlInput.value.length > 0);
      hideErr();
    });

    // Auto-play on paste if URL looks valid
    urlInput.addEventListener('paste', () => {
      setTimeout(() => {
        const v = urlInput.value.trim();
        urlClear.classList.toggle('show', v.length > 0);
        if (v.startsWith('http') && v.length > 15) handlePlay();
      }, 80);
    });

    urlClear.addEventListener('click', () => {
      urlInput.value = '';
      urlClear.classList.remove('show');
      hideErr();
      urlInput.focus();
    });

    subFileInput.addEventListener('change', handleSubFile);
    subRemove.addEventListener('click', removeSub);
  }

  /* ════ PLAY ════ */
  function handlePlay() {
    const url = urlInput.value.trim();

    if (!url) {
      showErr('Please paste a video URL first.');
      urlInput.focus();
      return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      showErr('URL must start with http:// or https://');
      return;
    }

    hideErr();
    U.LS.set('mb_last_url', url);

    showPlayer();
    Player.load(url);

    // If subtitle already loaded, auto-enable
    if (Subs.isLoaded()) Player.enableSubs();

    // Push history so browser back works
    history.pushState({ player: true }, '', '#playing');
  }

  /* ════ SUBTITLE FILE ════ */
  async function handleSubFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const n = await Subs.loadFile(file);
      subBadgeTxt.textContent = `${file.name} · ${n} cues`;
      subBadge.classList.remove('hidden');
      hideErr();

      // If player is active, enable immediately
      if (_playerActive) Player.enableSubs();

    } catch(err) {
      showErr(String(err));
    }

    subFileInput.value = ''; // reset so same file can reload
  }

  function removeSub() {
    Subs.clear();
    subBadge.classList.add('hidden');
    subBadgeTxt.textContent = '';
  }

  /* ════ SCREEN TRANSITIONS ════ */
  function showPlayer() {
    _playerActive = true;
    homeScreen.classList.add('hidden');
    playerScreen.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  function showHome() {
    _playerActive = false;
    playerScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');

    // Fix: pop history state if we pushed one
    if (location.hash === '#playing') {
      history.replaceState(null, '', location.pathname);
    }
  }

  /* ════ BROWSER BACK ════ */
  function bindBrowserBack() {
    window.addEventListener('popstate', (e) => {
      if (_playerActive) {
        Player.stop();
        showHome();
      }
    });
  }

  /* ════ ERROR ════ */
  function showErr(msg) {
    homeErrTxt.textContent = msg;
    homeError.classList.remove('hidden');
    clearTimeout(_errTimer);
    _errTimer = setTimeout(hideErr, 7000);
  }

  function hideErr() {
    homeError.classList.add('hidden');
    clearTimeout(_errTimer);
  }

  return { init, showHome };
})();

/* ── Bootstrap ── */
document.addEventListener('DOMContentLoaded', App.init);
