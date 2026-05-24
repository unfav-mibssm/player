'use strict';

/* ════════════════════════════════════════════
   APP.JS — Orchestrator
   Home ↔ Player navigation, URL input,
   subtitle file from home screen,
   browser back button, error display
   ════════════════════════════════════════════ */

const App = (() => {

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

  let _active   = false;
  let _errTimer = null;

  /* ══ INIT ══ */
  function init() {
    Player.init();

    /* Expose to player module */
    window.App = { showHome, updateSubBadge };

    /* Restore last URL */
    const last = U.LS.get('mb_last_url');
    if (last) {
      urlInput.value = last;
      urlClear.classList.add('show');
    }

    bindEvents();
  }

  /* ══ EVENTS ══ */
  function bindEvents() {
    playBtn.addEventListener('click', handlePlay);

    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handlePlay();
    });

    urlInput.addEventListener('input', () => {
      urlClear.classList.toggle('show', urlInput.value.length > 0);
      hideErr();
    });

    /* Auto-play on paste */
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
    subRemove.addEventListener('click',    removeSub);

    /* Browser back button */
    window.addEventListener('popstate', () => {
      if (_active) {
        Player.stop();
        showHome();
      }
    });
  }

  /* ══ PLAY ══ */
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
    _active = true;
    homeScreen.classList.add('hidden');
    playerScreen.classList.remove('hidden');
    window.scrollTo(0, 0);
    Player.load(url);
    if (Subs.isLoaded()) Player.enableSubs();
    history.pushState({ player: true }, '', '#playing');
  }

  /* ══ SUB FILE FROM HOME SCREEN ══ */
  async function handleSubFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const n = await Subs.loadFile(file);
      updateSubBadge(file.name, n);
      hideErr();
    } catch(err) {
      showErr(String(err));
    }
    subFileInput.value = '';
  }

  function removeSub() {
    Subs.clear();
    subBadge.classList.add('hidden');
    subBadgeTxt.textContent = '';
  }

  /* ══ SUB BADGE (called from player too) ══ */
  function updateSubBadge(name, count) {
    const display = name.length > 35 ? name.substring(0, 35) + '…' : name;
    subBadgeTxt.textContent = `${display} · ${count} cues`;
    subBadge.classList.remove('hidden');
  }

  /* ══ SHOW HOME ══ */
  function showHome() {
    _active = false;
    playerScreen.classList.add('hidden');
    homeScreen.classList.remove('hidden');
    if (location.hash === '#playing') {
      history.replaceState(null, '', location.pathname);
    }
  }

  /* ══ ERRORS ══ */
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

  return { init, showHome, updateSubBadge };
})();

document.addEventListener('DOMContentLoaded', App.init);
