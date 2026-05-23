'use strict';

const U = (() => {

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const s = Math.floor(sec);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (h > 0) return `${h}:${pad(m)}:${pad(ss)}`;
    return `${m}:${pad(ss)}`;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  function throttle(fn, ms) {
    let last = 0;
    return (...a) => {
      const now = Date.now();
      if (now - last >= ms) { last = now; fn(...a); }
    };
  }

  /* LocalStorage helpers — never throw */
  const LS = {
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    get(k)    { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } },
    del(k)    { try { localStorage.removeItem(k); } catch {} }
  };

  /* Stable hash key from URL */
  function hashKey(url) {
    let h = 0;
    for (let i = 0; i < Math.min(url.length, 120); i++) {
      h = ((h << 5) - h) + url.charCodeAt(i);
      h |= 0;
    }
    return 'mb_pos_' + Math.abs(h);
  }

  /* Detect content type from URL (best effort) */
  function typeOf(url) {
    const u = url.toLowerCase().split('?')[0];
    if (u.endsWith('.mkv'))  return 'mkv';
    if (u.endsWith('.webm')) return 'webm';
    if (u.endsWith('.mp4'))  return 'mp4';
    return 'mp4'; // assume mp4 for CDN links
  }

  /* Extract display title from URL */
  function titleOf(url) {
    try {
      const parts = new URL(url).pathname.split('/').filter(Boolean);
      const last = parts[parts.length - 1] || '';
      return decodeURIComponent(last.replace(/\.[^.]+$/, '').replace(/[._-]+/g, ' ')).trim() || 'Video';
    } catch { return 'Video'; }
  }

  /* Fullscreen helpers */
  function enterFS(el) {
    return (el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen || (() => Promise.reject())).call(el);
  }

  function exitFS() {
    return (document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen || (() => Promise.reject())).call(document);
  }

  function isFS() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
  }

  function isMobile() {
    return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  }

  return { fmt, clamp, debounce, throttle, LS, hashKey, typeOf, titleOf, enterFS, exitFS, isFS, isMobile };
})();
