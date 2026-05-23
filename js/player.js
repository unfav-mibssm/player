'use strict';

/* ════════════════════════════════════════════
   PLAYER.JS — Core video player
   Fixed bugs:
   - Resume banner doesn't block playback
   - Speed resets between videos
   - Controls hide properly
   - Subtitle toggle works correctly
   - Seekbar drag fixed on mobile
   - History back button works
   ════════════════════════════════════════════ */

const Player = (() => {

  /* ── DOM ── */
  let vid, wrap;
  let spinner;
  let overlay;
  let btnPP, icoPl, icoPa;
  let btnRW, btnFF;
  let btnMute, icoVol, icoMute;
  let seekbar, sbBuf, sbPlay, sbThumb;
  let tCur, tDur;
  let btnFS, icoFS, icoExitFS;
  let btnBack, btnPiP;
  let btnSpeed, speedLbl;
  let btnSubToggle;
  let speedPopup, speedList;
  let subDisplay;
  let zoneLeft, zoneRight;
  let flashLeft, flashRight, flashLeftLbl, flashRightLbl;
  let tapPulse, tapPulseIcon;
  let resumeBanner, resumeT, resumeYes, resumeNo;
  let playerError, playerErrorText, peBack;
  let vidTitle;

  /* ── State ── */
  let _url         = '';
  let _ctrlTimer   = null;
  let _saveTimer   = null;
  let _dragging    = false;
  let _speed       = 1;
  let _subOn       = false;

  // Double-tap detection
  let _tapTime  = 0;
  let _tapZone  = null;
  let _tapTimer = null;

  const SPEEDS     = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const SEEK_AMT   = 10;
  const HIDE_DELAY = 3500;
  const SAVE_INT   = 5000;

  /* ════ INIT ════ */
  function init() {
    vid           = document.getElementById('vid');
    wrap          = document.getElementById('player-wrap');
    spinner       = document.getElementById('spinner');
    overlay       = document.getElementById('ctrl-overlay');
    btnPP         = document.getElementById('btn-pp');
    icoPl         = document.getElementById('ico-play');
    icoPa         = document.getElementById('ico-pause');
    btnRW         = document.getElementById('btn-rw');
    btnFF         = document.getElementById('btn-ff');
    btnMute       = document.getElementById('btn-mute');
    icoVol        = document.getElementById('ico-vol');
    icoMute       = document.getElementById('ico-mute');
    seekbar       = document.getElementById('seekbar');
    sbBuf         = document.getElementById('sb-buf');
    sbPlay        = document.getElementById('sb-play');
    sbThumb       = document.getElementById('sb-thumb');
    tCur          = document.getElementById('t-cur');
    tDur          = document.getElementById('t-dur');
    btnFS         = document.getElementById('btn-fs');
    icoFS         = document.getElementById('ico-fs');
    icoExitFS     = document.getElementById('ico-exit-fs');
    btnBack       = document.getElementById('btn-back');
    btnPiP        = document.getElementById('btn-pip');
    btnSpeed      = document.getElementById('btn-speed');
    speedLbl      = document.getElementById('speed-lbl');
    btnSubToggle  = document.getElementById('btn-sub-toggle');
    speedPopup    = document.getElementById('speed-popup');
    speedList     = document.getElementById('speed-list');
    subDisplay    = document.getElementById('sub-display');
    zoneLeft      = document.getElementById('zone-left');
    zoneRight     = document.getElementById('zone-right');
    flashLeft     = document.getElementById('flash-left');
    flashRight    = document.getElementById('flash-right');
    flashLeftLbl  = document.getElementById('flash-left-label');
    flashRightLbl = document.getElementById('flash-right-label');
    tapPulse      = document.getElementById('tap-pulse');
    tapPulseIcon  = document.getElementById('tap-pulse-icon');
    resumeBanner  = document.getElementById('resume-banner');
    resumeT       = document.getElementById('resume-t');
    resumeYes     = document.getElementById('resume-yes');
    resumeNo      = document.getElementById('resume-no');
    playerError   = document.getElementById('player-error');
    playerErrorText = document.getElementById('player-error-text');
    peBack        = document.getElementById('pe-back');
    vidTitle      = document.getElementById('vid-title');

    // Init subtitle engine
    Subs.init(vid, subDisplay);

    buildSpeedMenu();
    bindVideoEvents();
    bindControlEvents();
    bindSeekbarEvents();
    bindGestureEvents();
    bindKeyboard();
    bindFullscreen();
  }

  /* ════ LOAD ════ */
  function load(url) {
    _url = url;

    // Hard reset
    stop();
    hideError();
    resumeBanner.classList.add('hidden');

    // Reset speed to 1x on new video
    _speed = 1;
    vid.playbackRate = 1;
    speedLbl.textContent = '1×';
    speedList.querySelectorAll('.popup-item').forEach((el, i) => {
      el.classList.toggle('active', SPEEDS[i] === 1);
    });

    // Reset subtitle state (but keep loaded file)
    _subOn = Subs.isLoaded(); // auto-enable if file was pre-loaded
    syncSubBtn();
    if (_subOn) Subs.enable(); else Subs.disable();

    vidTitle.textContent = U.titleOf(url);

    // Show spinner
    showSpinner();

    // Set source — browser handles the rest
    vid.src = url;
    vid.load();

    showControls();
  }

  /* ════ VIDEO EVENTS ════ */
  function bindVideoEvents() {
    vid.addEventListener('play',            onPlay);
    vid.addEventListener('pause',           onPause);
    vid.addEventListener('ended',           onEnded);
    vid.addEventListener('timeupdate',      onTime);
    vid.addEventListener('progress',        onBuffer);
    vid.addEventListener('waiting',         showSpinner);
    vid.addEventListener('playing',         hideSpinner);
    vid.addEventListener('canplay',         hideSpinner);
    vid.addEventListener('loadedmetadata',  onMeta);
    vid.addEventListener('durationchange',  onDuration);
    vid.addEventListener('error',           onError);
    vid.addEventListener('volumechange',    onVolume);
  }

  function onPlay() {
    icoPl.classList.add('hidden');
    icoPa.classList.remove('hidden');
    scheduleHide();
    startSaving();
  }

  function onPause() {
    icoPl.classList.remove('hidden');
    icoPa.classList.add('hidden');
    showControls();
    stopSaving();
  }

  function onEnded() {
    icoPl.classList.remove('hidden');
    icoPa.classList.add('hidden');
    showControls();
    stopSaving();
    savePos();
  }

  function onTime() {
    if (_dragging) return;
    const pct = vid.duration ? vid.currentTime / vid.duration : 0;
    sbPlay.style.width = (pct * 100) + '%';
    sbThumb.style.left = (pct * 100) + '%';
    tCur.textContent = U.fmt(vid.currentTime);
  }

  function onBuffer() {
    if (!vid.duration) return;
    let end = 0;
    for (let i = 0; i < vid.buffered.length; i++) {
      if (vid.buffered.start(i) <= vid.currentTime + 0.5) {
        end = Math.max(end, vid.buffered.end(i));
      }
    }
    sbBuf.style.width = ((end / vid.duration) * 100) + '%';
  }

  function onMeta() {
    tDur.textContent = U.fmt(vid.duration);
    hideSpinner();
    // Attempt autoplay, then check resume
    vid.play().then(() => {
      checkResume();
    }).catch(() => {
      // Autoplay blocked — show controls, wait for user tap
      showControls();
      checkResume();
    });
  }

  function onDuration() {
    if (vid.duration && isFinite(vid.duration)) {
      tDur.textContent = U.fmt(vid.duration);
    }
  }

  function onError() {
    hideSpinner();
    const e = vid.error;
    let msg = 'Playback failed. The URL may be invalid or the file format is not supported by your browser.';
    if (e) {
      switch(e.code) {
        case MediaError.MEDIA_ERR_NETWORK:
          msg = 'Network error — could not load the video. Check the URL and your connection.'; break;
        case MediaError.MEDIA_ERR_DECODE:
          msg = 'This file cannot be decoded. The codec (e.g. HEVC/x265) may not be supported on your browser/device. Try a different browser or a CDN link.'; break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          msg = 'Format not supported. If this is an HEVC/MKV file, try opening it in Safari (iPhone/Mac) or use a CDN-hosted link.'; break;
      }
    }
    showError(msg);
  }

  function onVolume() {
    const muted = vid.muted || vid.volume === 0;
    icoVol.classList.toggle('hidden', muted);
    icoMute.classList.toggle('hidden', !muted);
  }

  /* ════ CONTROLS ════ */
  function bindControlEvents() {
    btnPP.addEventListener('click',  togglePlay);
    btnRW.addEventListener('click',  () => seek(-SEEK_AMT));
    btnFF.addEventListener('click',  () => seek(+SEEK_AMT));
    btnMute.addEventListener('click',toggleMute);
    btnBack.addEventListener('click', goBack);
    btnPiP.addEventListener('click',  togglePiP);
    btnSpeed.addEventListener('click', (e) => { e.stopPropagation(); togglePopup(); });
    btnSubToggle.addEventListener('click', toggleSubs);
    resumeYes.addEventListener('click', doResume);
    resumeNo.addEventListener('click',  startOver);
    peBack.addEventListener('click',    goBack);

    // Close popup on outside tap
    wrap.addEventListener('click', (e) => {
      if (!speedPopup.contains(e.target) && e.target !== btnSpeed) {
        speedPopup.classList.add('hidden');
      }
    });
  }

  function togglePlay() {
    if (vid.paused || vid.ended) vid.play().catch(() => {});
    else vid.pause();
    flashTap();
  }

  function seek(delta) {
    vid.currentTime = U.clamp(vid.currentTime + delta, 0, vid.duration || 0);
  }

  function toggleMute() { vid.muted = !vid.muted; }

  function goBack() {
    stop();
    savePos();
    Subs.disable();
    window.App?.showHome();
  }

  async function togglePiP() {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await vid.requestPictureInPicture();
    } catch {}
  }

  function toggleSubs() {
    if (!Subs.isLoaded()) return; // nothing loaded
    _subOn = !_subOn;
    syncSubBtn();
    if (_subOn) Subs.enable(); else Subs.disable();
  }

  function syncSubBtn() {
    btnSubToggle.classList.toggle('active', _subOn && Subs.isLoaded());
  }

  /* Enable subs externally (called from App after file loaded mid-playback) */
  function enableSubs() {
    _subOn = true;
    syncSubBtn();
    Subs.enable();
  }

  function stop() {
    vid.pause();
    vid.removeAttribute('src');
    vid.load();
    stopSaving();
    hideSpinner();
    sbPlay.style.width = '0%';
    sbBuf.style.width = '0%';
    sbThumb.style.left = '0%';
    tCur.textContent = '0:00';
    tDur.textContent = '0:00';
  }

  /* ════ SPEED MENU ════ */
  function buildSpeedMenu() {
    speedList.innerHTML = '';
    SPEEDS.forEach(s => {
      const d = document.createElement('div');
      d.className = 'popup-item' + (s === 1 ? ' active' : '');
      d.innerHTML = `<span>${s}×</span><span class="check">✓</span>`;
      d.addEventListener('click', () => setSpeed(s));
      speedList.appendChild(d);
    });
  }

  function setSpeed(s) {
    _speed = s;
    vid.playbackRate = s;
    speedLbl.textContent = s + '×';
    speedList.querySelectorAll('.popup-item').forEach((el, i) => {
      el.classList.toggle('active', SPEEDS[i] === s);
    });
    speedPopup.classList.add('hidden');
  }

  function togglePopup() {
    speedPopup.classList.toggle('hidden');
    if (!speedPopup.classList.contains('hidden')) showControls();
  }

  /* ════ SEEKBAR ════ */
  function bindSeekbarEvents() {
    seekbar.addEventListener('mousedown',  onSBDown);
    document.addEventListener('mousemove', onSBMove);
    document.addEventListener('mouseup',   onSBUp);
    seekbar.addEventListener('touchstart', onSBTouchStart, { passive: false });
    document.addEventListener('touchmove', onSBTouchMove,  { passive: false });
    document.addEventListener('touchend',  onSBTouchEnd);
  }

  function onSBDown(e) {
    _dragging = true;
    seekbar.classList.add('dragging');
    updateFromMouse(e.clientX);
  }
  function onSBMove(e) {
    if (!_dragging) return;
    updateFromMouse(e.clientX);
  }
  function onSBUp() {
    if (!_dragging) return;
    commitSeek();
  }

  function onSBTouchStart(e) {
    e.preventDefault();
    _dragging = true;
    seekbar.classList.add('dragging');
    updateFromMouse(e.touches[0].clientX);
  }
  function onSBTouchMove(e) {
    if (!_dragging) return;
    e.preventDefault();
    updateFromMouse(e.touches[0].clientX);
  }
  function onSBTouchEnd() {
    if (!_dragging) return;
    commitSeek();
  }

  function updateFromMouse(clientX) {
    const rect = seekbar.getBoundingClientRect();
    const pct  = U.clamp((clientX - rect.left) / rect.width, 0, 1);
    sbPlay.style.width = (pct * 100) + '%';
    sbThumb.style.left = (pct * 100) + '%';
    tCur.textContent   = U.fmt(pct * (vid.duration || 0));
  }

  function commitSeek() {
    _dragging = false;
    seekbar.classList.remove('dragging');
    const pct = parseFloat(sbPlay.style.width) / 100;
    vid.currentTime = U.clamp(pct * (vid.duration || 0), 0, vid.duration || 0);
  }

  /* ════ GESTURE ZONES ════ */
  function bindGestureEvents() {
    // Double-tap seek on left/right zones
    zoneLeft.addEventListener('touchend',  (e) => handleZoneTap(e, 'left'),  { passive: false });
    zoneRight.addEventListener('touchend', (e) => handleZoneTap(e, 'right'), { passive: false });

    // Single tap on center → show/hide controls
    const center = document.getElementById('ctrl-center');
    center.addEventListener('click', () => {
      if (overlay.classList.contains('hide')) showControls();
      else scheduleHide();
    });
    center.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (overlay.classList.contains('hide')) showControls();
      else scheduleHide();
    }, { passive: false });

    // Mouse move on wrap → show controls
    wrap.addEventListener('mousemove', U.throttle(() => {
      showControls();
      scheduleHide();
    }, 200));
  }

  function handleZoneTap(e, zone) {
    e.preventDefault();
    const now = Date.now();

    if (now - _tapTime < 300 && _tapZone === zone) {
      // Double tap!
      clearTimeout(_tapTimer);
      _tapTimer = null;
      const delta = zone === 'right' ? +SEEK_AMT : -SEEK_AMT;
      seek(delta);

      const fl  = zone === 'left' ? flashLeft : flashRight;
      const lbl = zone === 'left' ? flashLeftLbl : flashRightLbl;
      lbl.textContent = (zone === 'right' ? '+' : '−') + SEEK_AMT + 's';
      showFlash(fl);

      _tapTime = 0; // reset so triple-tap doesn't chain wrong
      _tapZone = null;
    } else {
      // First tap — wait for possible second
      _tapZone = zone;
      _tapTime = now;
      clearTimeout(_tapTimer);
      _tapTimer = setTimeout(() => {
        // Was single tap — just show controls
        showControls();
        scheduleHide();
        _tapTimer = null;
      }, 300);
    }
  }

  function showFlash(el) {
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 750);
  }

  function flashTap() {
    tapPulseIcon.textContent = vid.paused ? '▶' : '⏸';
    tapPulse.classList.remove('hidden');
    clearTimeout(tapPulse._t);
    tapPulse._t = setTimeout(() => tapPulse.classList.add('hidden'), 500);
  }

  /* ════ CONTROLS SHOW/HIDE ════ */
  function showControls() {
    overlay.classList.remove('hide');
    clearTimeout(_ctrlTimer);
  }

  function scheduleHide() {
    clearTimeout(_ctrlTimer);
    if (!vid.paused) {
      _ctrlTimer = setTimeout(() => {
        speedPopup.classList.add('hidden');
        overlay.classList.add('hide');
      }, HIDE_DELAY);
    }
  }

  // Show controls on any touch of bottom bar
  document.getElementById('ctrl-bottom')?.addEventListener('touchstart', () => {
    showControls();
  }, { passive: true });

  /* ════ RESUME ════ */
  function checkResume() {
    const key  = U.hashKey(_url);
    const data = U.LS.get(key);
    if (data && data.pos > 8 && vid.duration && data.pos < vid.duration - 8) {
      // Pause the auto-play, show banner
      vid.pause();
      resumeT.textContent = U.fmt(data.pos);
      resumeBanner.classList.remove('hidden');
    }
  }

  function doResume() {
    const key  = U.hashKey(_url);
    const data = U.LS.get(key);
    resumeBanner.classList.add('hidden');
    if (data) vid.currentTime = data.pos;
    vid.play().catch(() => {});
  }

  function startOver() {
    resumeBanner.classList.add('hidden');
    vid.currentTime = 0;
    vid.play().catch(() => {});
  }

  function savePos() {
    if (!_url || !vid.duration || !isFinite(vid.duration)) return;
    U.LS.set(U.hashKey(_url), { pos: vid.currentTime, dur: vid.duration });
  }

  function startSaving() {
    stopSaving();
    _saveTimer = setInterval(savePos, SAVE_INT);
  }

  function stopSaving() {
    if (_saveTimer) { clearInterval(_saveTimer); _saveTimer = null; }
  }

  /* ════ ERROR ════ */
  function showError(msg) {
    playerErrorText.textContent = msg;
    playerError.classList.remove('hidden');
    hideSpinner();
  }

  function hideError() {
    playerError.classList.add('hidden');
  }

  /* ════ SPINNER ════ */
  function showSpinner() { spinner.classList.remove('hidden'); }
  function hideSpinner() { spinner.classList.add('hidden'); }

  /* ════ KEYBOARD ════ */
  function bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (document.getElementById('player-screen').classList.contains('hidden')) return;
      if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;

      switch(e.code) {
        case 'Space': case 'KeyK': e.preventDefault(); togglePlay(); break;
        case 'ArrowLeft':  e.preventDefault(); seek(-SEEK_AMT); break;
        case 'ArrowRight': e.preventDefault(); seek(+SEEK_AMT); break;
        case 'ArrowUp':    e.preventDefault(); vid.volume = U.clamp(vid.volume+0.1,0,1); break;
        case 'ArrowDown':  e.preventDefault(); vid.volume = U.clamp(vid.volume-0.1,0,1); break;
        case 'KeyM': toggleMute(); break;
        case 'KeyF': toggleFS(); break;
        case 'KeyP': togglePiP(); break;
        case 'Escape': if (U.isFS()) U.exitFS(); break;
      }
      showControls();
      scheduleHide();
    });
  }

  /* ════ FULLSCREEN ════ */
  function bindFullscreen() {
    btnFS.addEventListener('click', toggleFS);
    ['fullscreenchange','webkitfullscreenchange','mozfullscreenchange'].forEach(ev => {
      document.addEventListener(ev, onFSChange);
    });
  }

  async function toggleFS() {
    try {
      if (U.isFS()) await U.exitFS();
      else          await U.enterFS(wrap);
    } catch {}
  }

  function onFSChange() {
    const fs = U.isFS();
    icoFS.classList.toggle('hidden', fs);
    icoExitFS.classList.toggle('hidden', !fs);
    if (fs) {
      try { screen.orientation?.lock('landscape').catch(() => {}); } catch {}
    } else {
      try { screen.orientation?.unlock(); } catch {}
    }
    scheduleHide();
  }

  /* ════ PUBLIC ════ */
  return { init, load, stop, enableSubs };

})();
