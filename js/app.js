'use strict';

const App = (() => {
  
  const homeScreen = document.getElementById('home-screen');
  const playerScreen = document.getElementById('player-screen');
  const urlInput = document.getElementById('url-input');
  const urlClear = document.getElementById('url-clear');
  const playBtn = document.getElementById('play-btn');
  const subFileInput = document.getElementById('sub-file-input');
  const subBadge = document.getElementById('sub-loaded-badge');
  const subBadgeTxt = document.getElementById('sub-badge-text');
  const subRemove = document.getElementById('sub-remove');
  const homeError = document.getElementById('home-error');
  const homeErrTxt = document.getElementById('home-error-text');
  const hevcPopup = document.getElementById('hevc-popup');
  const hevcVlcBtn = document.getElementById('hevc-vlc-btn');
  const hevcTryBtn = document.getElementById('hevc-try-btn');
  const hevcClose = document.getElementById('hevc-close');
  
  let _active = false;
  let _pendingUrl = '';
  let _errTimer = null;
  
  /* ══ VLC LINK — correct URL per platform ══ */
  function getVlcLink(videoUrl) {
    const ua = navigator.userAgent;
    if (/Android/i.test(ua)) {
      return 'intent:' + videoUrl + '#Intent;package=org.videolan.vlc;end';
    }
    if (/iPad|iPhone|iPod/.test(ua)) {
      return 'vlc-x-callback://x-callback-url/stream?url=' + encodeURIComponent(videoUrl);
    }
    return 'vlc://' + videoUrl;
  }
  
  /* ══ INIT ══ */
  function init() {
    Player.init();
    window.App = { showHome, updateSubBadge };
    
    const last = U.LS.get('mb_last_url');
    if (last) {
      urlInput.value = last;
      urlClear.classList.add('show');
    }
    
    bindEvents();
    bindHevcPopup();
  }
  
  /* ══ HOME EVENTS ══ */
  function bindEvents() {
    playBtn.addEventListener('click', handlePlay);
    
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handlePlay();
    });
    
    urlInput.addEventListener('input', () => {
      urlClear.classList.toggle('show', urlInput.value.length > 0);
      hideErr();
    });
    
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
    
    window.addEventListener('popstate', () => {
      if (_active) { Player.stop();
        showHome(); }
    });
  }
  
  /* ══ HEVC POPUP ══ */
  function bindHevcPopup() {
    hevcVlcBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!_pendingUrl) return;
      window.location.href = getVlcLink(_pendingUrl);
      setTimeout(() => closeHevcPopup(), 800);
    });
    
    hevcTryBtn.addEventListener('click', () => {
      closeHevcPopup();
      launchPlayer(_pendingUrl);
    });
    
    hevcClose.addEventListener('click', closeHevcPopup);
    
    hevcPopup.addEventListener('click', (e) => {
      if (e.target === hevcPopup) closeHevcPopup();
    });
  }
  
  function showHevcPopup(url) {
    _pendingUrl = url;
    hevcPopup.classList.remove('hidden');
    document.body.classList.add('hevc-popup-open');
  }
  
  function closeHevcPopup() {
    hevcPopup.classList.add('hidden');
    document.body.classList.remove('hevc-popup-open');
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
    
    if (U.isHEVC(url)) {
      showHevcPopup(url);
      return;
    }
    
    launchPlayer(url);
  }
  
  function launchPlayer(url) {
    _active = true;
    homeScreen.classList.add('hidden');
    playerScreen.classList.remove('hidden');
    window.scrollTo(0, 0);
    Player.load(url);
    if (Subs.isLoaded()) Player.enableSubs();
    history.pushState({ player: true }, '', '#playing');
  }
  
  /* ══ SUBTITLE FILE FROM HOME ══ */
  async function handleSubFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const n = await Subs.loadFile(file);
      updateSubBadge(file.name, n);
      hideErr();
    } catch (err) {
      showErr(String(err));
    }
    subFileInput.value = '';
  }
  
  function removeSub() {
    Subs.clear();
    subBadge.classList.add('hidden');
    subBadgeTxt.textContent = '';
  }
  
  function updateSubBadge(name, count) {
    const display = name.length > 35 ? name.substring(0, 35) + '...' : name;
    subBadgeTxt.textContent = display + ' · ' + count + ' cues';
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
