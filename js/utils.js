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
  
  function throttle(fn, ms) {
    let last = 0;
    return (...a) => {
      const now = Date.now();
      if (now - last >= ms) { last = now;
        fn(...a); }
    };
  }
  
  const LS = {
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    get(k) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } },
    del(k) { try { localStorage.removeItem(k); } catch {} }
  };
  
  function hashKey(url) {
    let h = 0;
    for (let i = 0; i < Math.min(url.length, 120); i++) {
      h = ((h << 5) - h) + url.charCodeAt(i);
      h |= 0;
    }
    return 'mb_pos_' + Math.abs(h);
  }
  
  function titleOf(url) {
    try {
      const parts = new URL(url).pathname.split('/').filter(Boolean);
      const last = parts[parts.length - 1] || '';
      return decodeURIComponent(last.replace(/\.[^.]+$/, '').replace(/[._-]+/g, ' ')).trim() || 'Video';
    } catch { return 'Video'; }
  }
  
  /* Detect if URL likely contains HEVC/x265/10bit content */
  function isHEVC(url) {
    const u = (url || '').toLowerCase();
    return /hevc|x265|h265|10bit|hi10|hdr|10-bit/.test(u);
  }
  
  function enterFS(el) {
    const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    return fn ? fn.call(el) : Promise.reject();
  }
  
  function exitFS() {
    const fn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
    return fn ? fn.call(document) : Promise.reject();
  }
  
  function isFS() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
  }
  
  return { fmt, pad, clamp, throttle, LS, hashKey, titleOf, isHEVC, enterFS, exitFS, isFS };
})();
