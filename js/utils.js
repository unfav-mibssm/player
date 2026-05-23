/* ============================================
   StreamVault — utils.js
   Shared utility functions
   ============================================ */

'use strict';

const Utils = (() => {

  /**
   * Format seconds into H:MM:SS or M:SS
   */
  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    }
    return `${m}:${String(sec).padStart(2,'0')}`;
  }

  /**
   * Clamp a value between min and max
   */
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Debounce a function
   */
  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /**
   * Throttle a function
   */
  function throttle(fn, limit) {
    let inThrottle;
    return (...args) => {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  /**
   * Detect video type from URL
   */
  function detectVideoType(url) {
    if (!url) return 'unknown';
    const u = url.toLowerCase().split('?')[0];
    if (u.endsWith('.m3u8')) return 'hls';
    if (u.endsWith('.mp4'))  return 'mp4';
    if (u.endsWith('.mkv'))  return 'mkv';
    if (u.endsWith('.webm')) return 'webm';
    if (u.endsWith('.ogg') || u.endsWith('.ogv')) return 'ogg';
    // HLS streams sometimes don't have extension
    if (url.includes('.m3u8') || url.includes('hls') || url.includes('playlist')) return 'hls';
    return 'mp4'; // default assumption
  }

  /**
   * Extract filename from URL for display
   */
  function extractTitle(url) {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      const filename = parts[parts.length - 1] || u.hostname;
      // Remove extension and decode URI
      return decodeURIComponent(filename.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '));
    } catch {
      return url.substring(0, 60);
    }
  }

  /**
   * Check if browser supports HEVC
   */
  function supportsHEVC() {
    const v = document.createElement('video');
    return v.canPlayType('video/mp4; codecs="hvc1"') !== '' ||
           v.canPlayType('video/mp4; codecs="hev1"') !== '';
  }

  /**
   * Check if browser supports HLS natively (Safari)
   */
  function supportsHLSnatively() {
    const v = document.createElement('video');
    return v.canPlayType('application/vnd.apple.mpegurl') !== '';
  }

  /**
   * Local storage helpers with error handling
   */
  const Storage = {
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) { /* ignore quota errors */ }
    },
    get(key) {
      try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
      } catch { return null; }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    }
  };

  /**
   * Generate a simple hash key from URL (for storage)
   */
  function urlKey(url) {
    let hash = 0;
    for (let i = 0; i < Math.min(url.length, 100); i++) {
      hash = ((hash << 5) - hash) + url.charCodeAt(i);
      hash |= 0;
    }
    return `sv_pos_${Math.abs(hash)}`;
  }

  /**
   * Is device touch/mobile?
   */
  function isMobile() {
    return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  }

  /**
   * Request fullscreen (cross-browser)
   */
  function requestFullscreen(el) {
    if (el.requestFullscreen) return el.requestFullscreen();
    if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
    if (el.mozRequestFullScreen) return el.mozRequestFullScreen();
    if (el.msRequestFullscreen) return el.msRequestFullscreen();
    return Promise.reject('Fullscreen not supported');
  }

  /**
   * Exit fullscreen (cross-browser)
   */
  function exitFullscreen() {
    if (document.exitFullscreen) return document.exitFullscreen();
    if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
    if (document.mozCancelFullScreen) return document.mozCancelFullScreen();
    if (document.msExitFullscreen) return document.msExitFullscreen();
    return Promise.reject('Fullscreen not supported');
  }

  /**
   * Is currently fullscreen?
   */
  function isFullscreen() {
    return !!(document.fullscreenElement ||
              document.webkitFullscreenElement ||
              document.mozFullScreenElement ||
              document.msFullscreenElement);
  }

  return {
    formatTime,
    clamp,
    debounce,
    throttle,
    detectVideoType,
    extractTitle,
    supportsHEVC,
    supportsHLSnatively,
    Storage,
    urlKey,
    isMobile,
    requestFullscreen,
    exitFullscreen,
    isFullscreen
  };

})();
