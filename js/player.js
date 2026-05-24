'use strict';

/* ════════════════════════════════════════════
   PLAYER.JS
   All bugs fixed:
   - Speed resets on new video
   - Resume works correctly
   - Seekbar works on mobile touch
   - Controls auto-hide properly
   - Time display toggles elapsed/remaining on tap
   - VLC button shown only for HEVC/x265/10bit URLs
   - Subtitle toggle works
   - Browser back button works
   ════════════════════════════════════════════ */

const Player = (() => {

  /* ── DOM refs ── */
  let vid, wrap, spinner, overlay;
  let btnPP, icoPlay, icoPause;
  let btnRW, btnFF, btnMute, icoVol, icoMute;
  let seekbar, sbBuf, sbPlay, sbThumb;
  let timeDisplay, tCur, tDur;
  let btnFS, icoFS, icoExitFS;
  let btnBack, btnPiP, btnVLC;
  let btnSpeed, speedLbl, speedPopup, speedList;
  let btnSubToggle, btnSubSearch;
  let subDisplay;
  let subPanel, subPanelClose;
  let subSearchInput, subSearchBtn, subSearchStatus, subResults;
  let subFilePlayer;
  let zoneLeft, zoneRight, flashLeft, flashRight, flashLeftLbl, flashRightLbl;
  let tapPulse, tapPulseIcon;
  let resumeBanner, resumeT, resumeYes, resumeNo;
  let playerError, playerErrorText, peBack;
  let vidTitle;
  let ctrlBottom;

  /* ── State ── */
  let _url         = '';
  let _ctrlTimer   = null;
  let _saveTimer   = null;
  let _dragging    = false;
  let _speed       = 1;
  let _subOn       = false;
  let _showRemaining = false;   // time display mode

  /* Double-tap detection */
  let _tapTime  = 0;
  let _tapZone  = null;
  let _tapTimer = null;

  const SPEEDS     = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const SEEK_AMT   = 10;
  const HIDE_DELAY = 3500;
  const SAVE_INT   = 5000;

  /* ══════════════════════════════════════════
     INIT
  ══════════════════════════════════════════ */
  function init() {
    vid             = document.getElementById('vid');
    wrap            = document.getElementById('player-wrap');
    spinner         = document.getElementById('spinner');
    overlay         = document.getElementById('ctrl-overlay');
    btnPP           = document.getElementById('btn-pp');
    icoPlay         = document.getElementById('ico-play');
    icoPause        = document.getElementById('ico-pause');
    btnRW           = document.getElementById('btn-rw');
    btnFF           = document.getElementById('btn-ff');
    btnMute         = document.getElementById('btn-mute');
    icoVol          = document.getElementById('ico-vol');
    icoMute         = document.getElementById('ico-mute');
    seekbar         = document.getElementById('seekbar');
    sbBuf           = document.getElementById('sb-buf');
    sbPlay          = document.getElementById('sb-play');
    sbThumb         = document.getElementById('sb-thumb');
    timeDisplay     = document.getElementById('time-display');
    tCur            = document.getElementById('t-cur');
    tDur            = document.getElementById('t-dur');
    btnFS           = document.getElementById('btn-fs');
    icoFS           = document.getElementById('ico-fs');
    icoExitFS       = document.getElementById('ico-exit-fs');
    btnBack         = document.getElementById('btn-back');
    btnPiP          = document.getElementById('btn-pip');
    btnVLC          = document.getElementById('btn-vlc');
    btnSpeed        = document.getElementById('btn-speed');
    speedLbl        = document.getElementById('speed-lbl');
    speedPopup      = document.getElementById('speed-popup');
    speedList       = document.getElementById('speed-list');
    btnSubToggle    = document.getElementById('btn-sub-toggle');
    btnSubSearch    = document.getElementById('btn-sub-search');
    subDisplay      = document.getElementById('sub-display');
    subPanel        = document.getElementById('sub-panel');
    subPanelClose   = document.getElementById('sub-panel-close');
    subSearchInput  = document.getElementById('sub-search-input');
    subSearchBtn    = document.getElementById('sub-search-btn');
    subSearchStatus = document.getElementById('sub-search-status');
    subResults      = document.getElementById('sub-results');
    subFilePlayer   = document.getElementById('sub-file-player');
    zoneLeft        = document.getElementById('zone-left');
    zoneRight       = document.getElementById('zone-right');
    flashLeft       = document.getElementById('flash-left');
    flashRight      = document.getElementById('flash-right');
    flashLeftLbl    = document.getElementById('flash-left-label');
    flashRightLbl   = document.getElementById('flash-right-label');
    tapPulse        = document.getElementById('tap-pulse');
    tapPulseIcon    = document.getElementById('tap-pulse-icon');
    resumeBanner    = document.getElementById('resume-banner');
    resumeT         = document.getElementById('resume-t');
    resumeYes       = document.getElementById('resume-yes');
    resumeNo        = document.getElementById('resume-no');
    playerError     = document.getElementById('player-error');
    playerErrorText = document.getElementById('player-error-text');
    peBack          = document.getElementById('pe-back');
    vidTitle        = document.getElementById('vid-title');
    ctrlBottom      = document.getElementById('ctrl-bottom');

    Subs.init(vid, subDisplay);

    buildSpeedMenu();
    bindVideoEvents();
    bindControls();
    bindSeekbar();
    bindGestures();
    bindKeyboard();
    bindFullscreen();
    bindSubPanel();
    bindTimeToggle();
  }

  /* ══════════════════════════════════════════
     LOAD VIDEO
  ══════════════════════════════════════════ */
  function load(url) {
    _url = url;

    stop();
    hideError();
    resumeBanner.classList.add('hidden');
    speedPopup.classList.add('hidden');
    subPanel.classList.add('hidden');

    /* Reset speed to 1× on every new video */
    _speed = 1;
    vid.playbackRate = 1;
    speedLbl.textContent = '1×';
    speedList.querySelectorAll('.popup-item').forEach((el, i) => {
      el.classList.toggle('active', SPEEDS[i] === 1);
    });

    /* Reset time mode */
    _showRemaining = false;
    timeDisplay.classList.remove('show-remaining');

    /* Subtitle state — keep loaded file but start enabled if loaded */
    _subOn = Subs.isLoaded();
    syncSubBtn();
    if (_subOn) Subs.enable(); else Subs.disable();

    /* VLC button — only for HEVC/x265/10bit URLs */
    if (U.isHEVC(url)) {
      btnVLC.classList.remove('hidden');
      btnVLC.onclick = () => {
        const vlcUrl = 'vlc://' + url;
        window.location.href = vlcUrl;
      };
    } else {
      btnVLC.classList.add('hidden');
    }

    vidTitle.textContent = U.titleOf(url);

    /* Pre-fill subtitle search with video title */
    subSearchInput.value = U.titleOf(url);

    showSpinner();
    vid.src = url;
    vid.load();
    showControls();
  }

  /* ══════════════════════════════════════════
     VIDEO EVENTS
  ══════════════════════════════════════════ */
  function bindVideoEvents() {
    vid.addEventListener('play',           onPlay);
    vid.addEventListener('pause',          onPause);
    vid.addEventListener('ended',          onEnded);
    vid.addEventListener('timeupdate',     onTime);
    vid.addEventListener('progress',       onBuffer);
    vid.addEventListener('waiting',        showSpinner);
    vid.addEventListener('playing',        hideSpinner);
    vid.addEventListener('canplay',        hideSpinner);
    vid.addEventListener('loadedmetadata', onMeta);
    vid.addEventListener('durationchange', onDuration);
    vid.addEventListener('error',          onError);
    vid.addEventListener('volumechange',   onVolume);
  }

  function onPlay() {
    icoPlay.classList.add('hidden');
    icoPause.classList.remove('hidden');
    scheduleHide();
    startSaving();
  }

  function onPause() {
    icoPlay.classList.remove('hidden');
    icoPause.classList.add('hidden');
    showControls();
    stopSaving();
  }

  function onEnded() {
    icoPlay.classList.remove('hidden');
    icoPause.classList.add('hidden');
    showControls();
    stopSaving();
    savePos();
  }

  function onTime() {
    if (_dragging) return;
    const cur = vid.currentTime;
    const dur = vid.duration || 0;
    const pct = dur ? cur / dur : 0;

    sbPlay.style.width = (pct * 100) + '%';
    sbThumb.style.left = (pct * 100) + '%';

    if (_showRemaining && dur) {
      tCur.textContent = '−' + U.fmt(dur - cur);
      tDur.textContent = U.fmt(dur);
    } else {
      tCur.textContent = U.fmt(cur);
      tDur.textContent = U.fmt(dur);
    }
  }

  function onBuffer() {
    if (!vid.duration) return;
    let end = 0;
    for (let i = 0; i < vid.buffered.length; i++) {
      if (vid.buffered.start(i) <= vid.currentTime + 0.5) {
        end = Math.max(end, vid.buffered.end(i));
      }
    }
    sbBuf.style.width = (end / vid.duration * 100) + '%';
  }

  function onMeta() {
    tDur.textContent = U.fmt(vid.duration);
    hideSpinner();
    vid.play().then(() => {
      checkResume();
    }).catch(() => {
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
    let msg = 'Playback failed. The URL may be invalid or the server blocked access.';
    if (e) {
      switch(e.code) {
        case MediaError.MEDIA_ERR_NETWORK:
          msg = 'Network error — could not load the video. Check the URL and your connection.'; break;
        case MediaError.MEDIA_ERR_DECODE:
          msg = 'This codec cannot be decoded by your browser. If this is HEVC/x265, use the "Open in VLC" button or try Safari on iPhone/Mac.'; break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          msg = 'Format not supported by your browser. For HEVC/MKV files, try Safari (iPhone/Mac) or tap "Open in VLC".'; break;
      }
    }
    showError(msg);
  }

  function onVolume() {
    const muted = vid.muted || vid.volume === 0;
    icoVol.classList.toggle('hidden', muted);
    icoMute.classList.toggle('hidden', !muted);
  }

  /* ══════════════════════════════════════════
     TIME DISPLAY TOGGLE
  ══════════════════════════════════════════ */
  function bindTimeToggle() {
    timeDisplay.addEventListener('click', () => {
      _showRemaining = !_showRemaining;
      timeDisplay.classList.toggle('show-remaining', _showRemaining);
      onTime(); // refresh immediately
    });
    timeDisplay.addEventListener('touchend', (e) => {
      e.preventDefault();
      _showRemaining = !_showRemaining;
      timeDisplay.classList.toggle('show-remaining', _showRemaining);
      onTime();
    }, { passive: false });
  }

  /* ══════════════════════════════════════════
     CONTROLS
  ══════════════════════════════════════════ */
  function bindControls() {
    btnPP.addEventListener('click',   togglePlay);
    btnRW.addEventListener('click',   () => seek(-SEEK_AMT));
    btnFF.addEventListener('click',   () => seek(+SEEK_AMT));
    btnMute.addEventListener('click', () => { vid.muted = !vid.muted; });
    btnBack.addEventListener('click', goBack);
    btnPiP.addEventListener('click',  togglePiP);

    btnSpeed.addEventListener('click', (e) => {
      e.stopPropagation();
      speedPopup.classList.toggle('hidden');
      if (!speedPopup.classList.contains('hidden')) showControls();
    });

    btnSubToggle.addEventListener('click', toggleSubs);

    resumeYes.addEventListener('click', doResume);
    resumeNo.addEventListener('click',  startOver);
    peBack.addEventListener('click',    goBack);

    /* Close speed popup on outside click */
    wrap.addEventListener('click', (e) => {
      if (!speedPopup.contains(e.target) && e.target !== btnSpeed && !btnSpeed.contains(e.target)) {
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
    if (!vid.duration) return;
    vid.currentTime = U.clamp(vid.currentTime + delta, 0, vid.duration);
  }

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
    if (!Subs.isLoaded()) {
      /* Nothing loaded — open the search panel */
      openSubPanel();
      return;
    }
    _subOn = !_subOn;
    syncSubBtn();
    if (_subOn) Subs.enable(); else Subs.disable();
  }

  function syncSubBtn() {
    btnSubToggle.classList.toggle('sub-on', _subOn && Subs.isLoaded());
  }

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
    sbBuf.style.width  = '0%';
    sbThumb.style.left = '0%';
    tCur.textContent   = '0:00';
    tDur.textContent   = '0:00';
  }

  /* ══════════════════════════════════════════
     SPEED MENU
  ══════════════════════════════════════════ */
  function buildSpeedMenu() {
    speedList.innerHTML = '';
    SPEEDS.forEach(s => {
      const d = document.createElement('div');
      d.className = 'popup-item' + (s === 1 ? ' active' : '');
      d.innerHTML = `<span>${s}×</span><span class="check">✓</span>`;
      d.addEventListener('click', () => {
        _speed = s;
        vid.playbackRate = s;
        speedLbl.textContent = s + '×';
        speedList.querySelectorAll('.popup-item').forEach((el, i) => {
          el.classList.toggle('active', SPEEDS[i] === s);
        });
        speedPopup.classList.add('hidden');
      });
      speedList.appendChild(d);
    });
  }

  /* ══════════════════════════════════════════
     SEEKBAR
  ══════════════════════════════════════════ */
  function bindSeekbar() {
    seekbar.addEventListener('mousedown',  sbDown);
    document.addEventListener('mousemove', sbMove);
    document.addEventListener('mouseup',   sbUp);

    seekbar.addEventListener('touchstart', sbTouchStart, { passive: false });
    document.addEventListener('touchmove', sbTouchMove,  { passive: false });
    document.addEventListener('touchend',  sbTouchEnd);
  }

  function sbDown(e)  { _dragging = true; seekbar.classList.add('dragging'); sbUpdate(e.clientX); }
  function sbMove(e)  { if (_dragging) sbUpdate(e.clientX); }
  function sbUp()     { if (_dragging) { _dragging = false; seekbar.classList.remove('dragging'); sbCommit(); } }

  function sbTouchStart(e) { e.preventDefault(); _dragging = true; seekbar.classList.add('dragging'); sbUpdate(e.touches[0].clientX); }
  function sbTouchMove(e)  { if (_dragging) { e.preventDefault(); sbUpdate(e.touches[0].clientX); } }
  function sbTouchEnd()    { if (_dragging) { _dragging = false; seekbar.classList.remove('dragging'); sbCommit(); } }

  function sbUpdate(clientX) {
    const rect = seekbar.getBoundingClientRect();
    const pct  = U.clamp((clientX - rect.left) / rect.width, 0, 1);
    sbPlay.style.width = (pct * 100) + '%';
    sbThumb.style.left = (pct * 100) + '%';
    const t = pct * (vid.duration || 0);
    tCur.textContent = _showRemaining && vid.duration
      ? '−' + U.fmt(vid.duration - t)
      : U.fmt(t);
  }

  function sbCommit() {
    const pct = parseFloat(sbPlay.style.width) / 100;
    vid.currentTime = U.clamp(pct * (vid.duration || 0), 0, vid.duration || 0);
  }

  /* ══════════════════════════════════════════
     GESTURE ZONES (double-tap seek)
  ══════════════════════════════════════════ */
  function bindGestures() {
    zoneLeft.addEventListener('touchend',  (e) => handleZoneTap(e, 'left'),  { passive: false });
    zoneRight.addEventListener('touchend', (e) => handleZoneTap(e, 'right'), { passive: false });

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

    wrap.addEventListener('mousemove', U.throttle(() => {
      showControls();
      scheduleHide();
    }, 200));
  }

  function handleZoneTap(e, zone) {
    e.preventDefault();
    const now = Date.now();
    if (now - _tapTime < 300 && _tapZone === zone) {
      clearTimeout(_tapTimer);
      _tapTimer = null;
      const delta = zone === 'right' ? +SEEK_AMT : -SEEK_AMT;
      seek(delta);
      const fl  = zone === 'left' ? flashLeft  : flashRight;
      const lbl = zone === 'left' ? flashLeftLbl : flashRightLbl;
      lbl.textContent = (zone === 'right' ? '+' : '−') + SEEK_AMT + 's';
      showFlash(fl);
      _tapTime = 0;
      _tapZone = null;
    } else {
      _tapZone = zone;
      _tapTime = now;
      clearTimeout(_tapTimer);
      _tapTimer = setTimeout(() => {
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

  /* ══════════════════════════════════════════
     CONTROLS SHOW / HIDE
  ══════════════════════════════════════════ */
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

  /* Keep controls visible when touching bottom bar */
  document.addEventListener('DOMContentLoaded', () => {
    ctrlBottom?.addEventListener('touchstart', () => {
      showControls();
    }, { passive: true });
  });

  /* ══════════════════════════════════════════
     RESUME
  ══════════════════════════════════════════ */
  function checkResume() {
    const data = U.LS.get(U.hashKey(_url));
    if (data && data.pos > 8 && vid.duration && data.pos < vid.duration - 8) {
      vid.pause();
      resumeT.textContent = U.fmt(data.pos);
      resumeBanner.classList.remove('hidden');
    }
  }

  function doResume() {
    const data = U.LS.get(U.hashKey(_url));
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

  /* ══════════════════════════════════════════
     ERROR
  ══════════════════════════════════════════ */
  function showError(msg) {
    playerErrorText.textContent = msg;
    playerError.classList.remove('hidden');
    hideSpinner();
  }

  function hideError() {
    playerError.classList.add('hidden');
  }

  /* ══════════════════════════════════════════
     SPINNER
  ══════════════════════════════════════════ */
  function showSpinner() { spinner.classList.remove('hidden'); }
  function hideSpinner() { spinner.classList.add('hidden'); }

  /* ══════════════════════════════════════════
     KEYBOARD
  ══════════════════════════════════════════ */
  function bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (document.getElementById('player-screen').classList.contains('hidden')) return;
      if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
      switch(e.code) {
        case 'Space': case 'KeyK': e.preventDefault(); togglePlay(); break;
        case 'ArrowLeft':  e.preventDefault(); seek(-SEEK_AMT); break;
        case 'ArrowRight': e.preventDefault(); seek(+SEEK_AMT); break;
        case 'ArrowUp':    e.preventDefault(); vid.volume = U.clamp(vid.volume + 0.1, 0, 1); break;
        case 'ArrowDown':  e.preventDefault(); vid.volume = U.clamp(vid.volume - 0.1, 0, 1); break;
        case 'KeyM': vid.muted = !vid.muted; break;
        case 'KeyF': toggleFS(); break;
        case 'KeyP': togglePiP(); break;
        case 'Escape':
          if (!subPanel.classList.contains('hidden')) { subPanel.classList.add('hidden'); break; }
          if (U.isFS()) U.exitFS();
          break;
      }
      showControls();
      scheduleHide();
    });
  }

  /* ══════════════════════════════════════════
     FULLSCREEN
  ══════════════════════════════════════════ */
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

  /* ══════════════════════════════════════════
     SUBTITLE SEARCH PANEL
  ══════════════════════════════════════════ */
  function bindSubPanel() {
    btnSubSearch.addEventListener('click', openSubPanel);

    subPanelClose.addEventListener('click', () => {
      subPanel.classList.add('hidden');
    });

    subSearchBtn.addEventListener('click', runSubSearch);

    subSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runSubSearch();
    });

    /* File upload inside panel */
    subFilePlayer.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const n = await Subs.loadFile(file);
        subPanel.classList.add('hidden');
        enableSubs();
        window.App?.updateSubBadge(file.name, n);
      } catch(err) {
        setStatus('error', err);
      }
      subFilePlayer.value = '';
    });
  }

  function openSubPanel() {
    subPanel.classList.remove('hidden');
    subResults.innerHTML = '';
    setStatus('hidden');
    showControls(); // keep controls visible
    setTimeout(() => subSearchInput.focus(), 200);
  }

  async function runSubSearch() {
    const q = subSearchInput.value.trim();
    if (!q) { setStatus('error', 'Please enter a movie or show name.'); return; }

    subResults.innerHTML = '';
    setStatus('loading', 'Searching…');
    subSearchBtn.disabled = true;

    try {
      const results = await SubSearch.search(q);
      setStatus('hidden');
      renderResults(results);
    } catch(err) {
      setStatus('error', err.message || String(err));
    } finally {
      subSearchBtn.disabled = false;
    }
  }

  function renderResults(results) {
    subResults.innerHTML = '';
    if (results.length === 0) {
      setStatus('info', 'No results found. Try a different title.');
      return;
    }
    results.forEach(item => {
      const div = document.createElement('div');
      div.className = 'sub-result-item';
      const srcBadge = item.source === 'subdl' ? 'SubDL' : 'OpenSubs';
      div.innerHTML = `
        <div class="sri-name">${escHtml(item.name)}</div>
        <div class="sri-meta">
          <span class="sri-badge">${srcBadge}</span>
          ${item.downloads ? `<span>${item.downloads.toLocaleString()} downloads</span>` : ''}
          ${item.rating ? `<span>★ ${item.rating}</span>` : ''}
        </div>`;
      div.addEventListener('click', () => downloadAndLoad(item, div));
      subResults.appendChild(div);
    });
  }

  async function downloadAndLoad(item, rowEl) {
    /* Show loading state on the row */
    const original = rowEl.innerHTML;
    rowEl.innerHTML = `<div class="sri-loading">Downloading subtitle…</div>`;
    rowEl.style.pointerEvents = 'none';

    try {
      const result = await SubSearch.download(item);

      if (result.type === 'zip') {
        throw new Error('ZIP download not supported in browser. Try another subtitle.');
      }

      const n = Subs.loadText(result.text, result.type);
      subPanel.classList.add('hidden');
      enableSubs();
      window.App?.updateSubBadge(item.name, n);

    } catch(err) {
      rowEl.innerHTML = original;
      rowEl.style.pointerEvents = '';
      setStatus('error', 'Download failed: ' + (err.message || err));
    }
  }

  function setStatus(type, msg) {
    if (type === 'hidden') {
      subSearchStatus.classList.add('hidden');
      return;
    }
    subSearchStatus.className = 'sub-search-status ' + type;
    subSearchStatus.textContent = msg || '';
    subSearchStatus.classList.remove('hidden');
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ══════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════ */
  return { init, load, stop, enableSubs };

})();
