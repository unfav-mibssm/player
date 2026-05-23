/* ============================================
   StreamVault — player.js
   Core video player: HLS, controls, gestures,
   keyboard, audio tracks, fullscreen, PiP
   ============================================ */

'use strict';

const Player = (() => {

  // ─── DOM References ────────────────────────────────────────────
  let video, wrapper, overlay, spinner;
  let playPauseBtn, playIcon, pauseIcon;
  let rewindBtn, forwardBtn;
  let muteBtn, volIcon, muteIcon, volumeSlider;
  let progressBar, progressPlayed, progressBuffered, progressThumb;
  let currentTimeEl, totalTimeEl;
  let fullscreenBtn, fsIcon, exitFsIcon;
  let backBtn, pipBtn;
  let speedBtn, speedLabel;
  let audioBtn, subtitleBtn;
  let speedMenu, speedItems;
  let audioMenu, audioItems;
  let subtitleMenu, subtitleItems;
  let tapIndicator, tapIcon;
  let rippleLeft, rippleRight, seekLabelLeft, seekLabelRight;
  let resumeBanner, resumeTimeLabel, resumeYes, resumeNo;
  let videoTitleDisplay;
  let gestureLeft, gestureRight;

  // ─── State ─────────────────────────────────────────────────────
  let hls = null;
  let currentUrl = '';
  let controlsTimeout = null;
  let isProgressDragging = false;
  let isSeeking = false;
  let lastTapTime = 0;
  let lastTapZone = null; // 'left' | 'right'
  let tapCount = 0;
  let tapTimer = null;
  let pendingSingleTap = null;
  let subtitlesEnabled = false;
  let activeSpeed = 1;

  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const SEEK_SECONDS = 10;
  const CONTROLS_HIDE_DELAY = 3500;
  const SAVE_POSITION_INTERVAL = 5000; // ms

  // Position save interval
  let savePositionTimer = null;

  // ─── Init ──────────────────────────────────────────────────────
  function init() {
    // Grab all DOM elements
    video              = document.getElementById('main-video');
    wrapper            = document.getElementById('video-wrapper');
    overlay            = document.getElementById('controls-overlay');
    spinner            = document.getElementById('loading-spinner');

    playPauseBtn       = document.getElementById('play-pause-btn');
    playIcon           = document.getElementById('play-icon');
    pauseIcon          = document.getElementById('pause-icon');
    rewindBtn          = document.getElementById('rewind-btn');
    forwardBtn         = document.getElementById('forward-btn');

    muteBtn            = document.getElementById('mute-btn');
    volIcon            = document.getElementById('vol-icon');
    muteIcon           = document.getElementById('mute-icon');
    volumeSlider       = document.getElementById('volume-slider');

    progressBar        = document.getElementById('progress-bar');
    progressPlayed     = document.getElementById('progress-played');
    progressBuffered   = document.getElementById('progress-buffered');
    progressThumb      = document.getElementById('progress-thumb');

    currentTimeEl      = document.getElementById('current-time');
    totalTimeEl        = document.getElementById('total-time');

    fullscreenBtn      = document.getElementById('fullscreen-btn');
    fsIcon             = document.getElementById('fs-icon');
    exitFsIcon         = document.getElementById('exit-fs-icon');

    backBtn            = document.getElementById('back-btn');
    pipBtn             = document.getElementById('pip-btn');

    speedBtn           = document.getElementById('speed-btn');
    speedLabel         = document.getElementById('speed-label');
    audioBtn           = document.getElementById('audio-btn');
    subtitleBtn        = document.getElementById('subtitle-btn');

    speedMenu          = document.getElementById('speed-menu');
    speedItems         = document.getElementById('speed-items');
    audioMenu          = document.getElementById('audio-menu');
    audioItems         = document.getElementById('audio-items');
    subtitleMenu       = document.getElementById('subtitle-menu');
    subtitleItems      = document.getElementById('subtitle-items');

    tapIndicator       = document.getElementById('tap-indicator');
    tapIcon            = document.getElementById('tap-icon');
    rippleLeft         = document.getElementById('ripple-left');
    rippleRight        = document.getElementById('ripple-right');
    seekLabelLeft      = document.getElementById('seek-label-left');
    seekLabelRight     = document.getElementById('seek-label-right');

    resumeBanner       = document.getElementById('resume-banner');
    resumeTimeLabel    = document.getElementById('resume-time-label');
    resumeYes          = document.getElementById('resume-yes');
    resumeNo           = document.getElementById('resume-no');

    videoTitleDisplay  = document.getElementById('video-title-display');

    gestureLeft        = document.getElementById('gesture-left');
    gestureRight       = document.getElementById('gesture-right');

    // Build speed menu items
    buildSpeedMenu();

    // Bind events
    bindVideoEvents();
    bindControlEvents();
    bindProgressEvents();
    bindGestureEvents();
    bindKeyboardEvents();
    bindFullscreenEvents();
    bindMenuEvents();
    bindResumeEvents();

    // Subtitle init
    SubtitleManager.init(
      video,
      document.getElementById('custom-subtitle-container'),
      document.getElementById('custom-subtitle')
    );
    bindSubtitleSettings();
  }

  // ─── Load Video ────────────────────────────────────────────────
  function load(url) {
    if (!url) return;
    currentUrl = url;

    // Reset previous
    destroyHLS();
    video.pause();
    video.removeAttribute('src');
    video.load();
    subtitleBtn.classList.remove('active');

    // Disable native text tracks
    for (const t of video.textTracks) {
      t.mode = 'disabled';
    }

    SubtitleManager.clear();
    subtitlesEnabled = false;
    clearAudioMenu();
    clearSubtitleMenu();

    const type = Utils.detectVideoType(url);
    videoTitleDisplay.textContent = Utils.extractTitle(url);

    showSpinner();

    if (type === 'hls') {
      loadHLS(url);
    } else {
      loadDirect(url, type);
    }

    checkCodecSupport(type, url);
    scheduleHideControls();
  }

  function loadHLS(url) {
    if (Utils.supportsHLSnatively() && !window.Hls) {
      // Safari native HLS
      video.src = url;
      video.load();
      return;
    }

    if (!window.Hls || !Hls.isSupported()) {
      showError('HLS is not supported in this browser.');
      return;
    }

    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      maxBufferLength: 60,
      maxMaxBufferLength: 120,
      startPosition: -1,
    });

    hls.loadSource(url);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
      populateAudioTracks();
      populateSubtitleTracksHLS();
      checkResume();
    });

    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            showError('Network error: Could not load stream. Check the URL and your connection.');
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            showError('Media error: Codec may not be supported. Trying recovery…');
            hls.recoverMediaError();
            break;
          default:
            showError('Playback failed. The stream may be unavailable or unsupported.');
            break;
        }
      }
    });
  }

  function loadDirect(url, type) {
    // MKV and MP4 direct
    const mimeMap = {
      mp4:  'video/mp4',
      mkv:  'video/x-matroska',
      webm: 'video/webm',
      ogg:  'video/ogg',
    };
    const mime = mimeMap[type] || 'video/mp4';

    // Check if browser can (possibly) play it
    const canPlay = video.canPlayType(mime);
    if (canPlay === '') {
      // Try anyway — might work with autodetect
      showCodecInfo(`Your browser may not fully support ${type.toUpperCase()} files.`);
    }

    video.src = url;
    video.load();

    video.addEventListener('loadedmetadata', () => {
      populateNativeAudioTracks();
      populateNativeSubtitleTracks();
      checkResume();
    }, { once: true });
  }

  // ─── Codec Check / Info ────────────────────────────────────────
  function checkCodecSupport(type, url) {
    if (type === 'mkv') {
      showCodecInfo('MKV container: playback depends on browser codec support. Some tracks may not play.');
    } else if (url.toLowerCase().includes('hevc') || url.toLowerCase().includes('x265') || url.toLowerCase().includes('h265')) {
      if (!Utils.supportsHEVC()) {
        showCodecInfo('HEVC/x265 detected — your browser may not support it. Try Chrome on Android or Safari on iOS.');
      }
    }
  }

  function showCodecInfo(msg) {
    // Remove any existing
    const existing = wrapper.querySelector('.codec-info-bar');
    if (existing) existing.remove();

    const bar = document.createElement('div');
    bar.className = 'codec-info-bar';
    bar.innerHTML = `<span>ℹ</span><span>${msg}</span><span class="close-info">✕</span>`;
    bar.querySelector('.close-info').onclick = () => bar.remove();
    wrapper.appendChild(bar);
    setTimeout(() => bar.remove(), 8000);
  }

  // ─── Audio Tracks ──────────────────────────────────────────────
  function populateAudioTracks() {
    if (!hls) return;
    const tracks = hls.audioTracks;
    if (!tracks || tracks.length <= 1) return;

    clearAudioMenu();
    tracks.forEach((track, i) => {
      addAudioItem(track.name || track.lang || `Track ${i+1}`, i, i === hls.audioTrack);
    });
    audioBtn.style.display = '';
  }

  function populateNativeAudioTracks() {
    // HTML5 video audioTracks (limited support)
    if (!video.audioTracks || video.audioTracks.length <= 1) return;
    clearAudioMenu();
    for (let i = 0; i < video.audioTracks.length; i++) {
      const t = video.audioTracks[i];
      addAudioItem(t.label || t.language || `Track ${i+1}`, i, t.enabled);
    }
    audioBtn.style.display = '';
  }

  function addAudioItem(name, index, isActive) {
    const div = document.createElement('div');
    div.className = 'menu-item' + (isActive ? ' active' : '');
    div.innerHTML = `<span>${name}</span><svg class="check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
    div.addEventListener('click', () => selectAudioTrack(index));
    audioItems.appendChild(div);
  }

  function selectAudioTrack(index) {
    if (hls) {
      hls.audioTrack = index;
    } else if (video.audioTracks) {
      for (let i = 0; i < video.audioTracks.length; i++) {
        video.audioTracks[i].enabled = (i === index);
      }
    }
    // Update UI
    audioItems.querySelectorAll('.menu-item').forEach((el, i) => {
      el.classList.toggle('active', i === index);
    });
    closeAllMenus();
  }

  function clearAudioMenu() {
    audioItems.innerHTML = '';
    audioBtn.style.display = 'none';
  }

  // ─── Subtitle Tracks ───────────────────────────────────────────
  function populateSubtitleTracksHLS() {
    if (!hls) return;
    const tracks = hls.subtitleTracks;
    clearSubtitleMenu();
    addSubtitleItem('Off', -1, true);

    if (tracks && tracks.length > 0) {
      tracks.forEach((track, i) => {
        addSubtitleItem(track.name || track.lang || `Subtitle ${i+1}`, i, false);
      });
    }

    if (SubtitleManager.hasSubtitles()) {
      addSubtitleItem('Loaded File', 'file', false);
    }
  }

  function populateNativeSubtitleTracks() {
    clearSubtitleMenu();
    addSubtitleItem('Off', -1, true);

    const tracks = video.textTracks;
    if (tracks && tracks.length > 0) {
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        if (t.kind === 'subtitles' || t.kind === 'captions') {
          addSubtitleItem(t.label || t.language || `Track ${i+1}`, `native-${i}`, false);
        }
      }
    }

    if (SubtitleManager.hasSubtitles()) {
      addSubtitleItem('Loaded File', 'file', false);
    }
  }

  function refreshSubtitleMenu() {
    const wasOff = subtitleItems.querySelector('.menu-item.active')?.dataset?.idx === '-1';
    populateNativeSubtitleTracks();
    if (!wasOff && SubtitleManager.hasSubtitles()) {
      selectSubtitleTrack('file');
    }
  }

  function addSubtitleItem(name, idx, isActive) {
    const div = document.createElement('div');
    div.className = 'menu-item' + (isActive ? ' active' : '');
    div.dataset.idx = idx;
    div.innerHTML = `<span>${name}</span><svg class="check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
    div.addEventListener('click', () => selectSubtitleTrack(idx));
    subtitleItems.appendChild(div);
  }

  function selectSubtitleTrack(idx) {
    // Update active state
    subtitleItems.querySelectorAll('.menu-item').forEach(el => {
      el.classList.toggle('active', el.dataset.idx == idx);
    });

    // Disable all native tracks first
    for (const t of video.textTracks) { t.mode = 'disabled'; }
    SubtitleManager.disable();
    subtitlesEnabled = false;

    if (idx === -1 || idx === '-1') {
      // Off
      closeAllMenus();
      return;
    }

    if (idx === 'file') {
      // Use loaded file
      SubtitleManager.enable();
      subtitlesEnabled = true;
    } else if (typeof idx === 'string' && idx.startsWith('native-')) {
      const i = parseInt(idx.replace('native-', ''));
      const t = video.textTracks[i];
      if (t) {
        t.mode = 'showing';
        // Try to use SubtitleManager for custom styling
        video.textTracks[i].addEventListener('cuechange', () => {}, { once: false });
      }
    } else if (hls) {
      hls.subtitleTrack = parseInt(idx);
    }

    closeAllMenus();
  }

  function clearSubtitleMenu() {
    subtitleItems.innerHTML = '';
  }

  // ─── Subtitle Settings ─────────────────────────────────────────
  function bindSubtitleSettings() {
    const sizeSlider    = document.getElementById('sub-size');
    const sizeVal       = document.getElementById('sub-size-val');
    const opacitySlider = document.getElementById('sub-opacity');
    const opacityVal    = document.getElementById('sub-opacity-val');
    const bgSelect      = document.getElementById('sub-bg');

    sizeSlider.addEventListener('input', () => {
      sizeVal.textContent = sizeSlider.value + '%';
      SubtitleManager.updateSettings({ fontSize: parseInt(sizeSlider.value) });
    });

    opacitySlider.addEventListener('input', () => {
      opacityVal.textContent = opacitySlider.value + '%';
      SubtitleManager.updateSettings({ opacity: parseInt(opacitySlider.value) });
    });

    bgSelect.addEventListener('change', () => {
      SubtitleManager.updateSettings({ background: bgSelect.value });
    });
  }

  // ─── Resume ────────────────────────────────────────────────────
  function checkResume() {
    const key = Utils.urlKey(currentUrl);
    const saved = Utils.Storage.get(key);
    if (saved && saved.position > 10 && saved.position < (video.duration - 10)) {
      resumeTimeLabel.textContent = Utils.formatTime(saved.position);
      resumeBanner.classList.remove('hidden');
    }
  }

  function bindResumeEvents() {
    resumeYes.addEventListener('click', () => {
      const key = Utils.urlKey(currentUrl);
      const saved = Utils.Storage.get(key);
      if (saved) {
        video.currentTime = saved.position;
      }
      resumeBanner.classList.add('hidden');
      video.play().catch(() => {});
    });

    resumeNo.addEventListener('click', () => {
      resumeBanner.classList.add('hidden');
      video.play().catch(() => {});
    });
  }

  function savePosition() {
    if (!currentUrl || !video.duration || isNaN(video.duration)) return;
    const key = Utils.urlKey(currentUrl);
    Utils.Storage.set(key, {
      position: video.currentTime,
      duration: video.duration,
      savedAt: Date.now()
    });
  }

  // ─── Video Events ──────────────────────────────────────────────
  function bindVideoEvents() {
    video.addEventListener('play',       onPlay);
    video.addEventListener('pause',      onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('progress',   onBufferUpdate);
    video.addEventListener('waiting',    onWaiting);
    video.addEventListener('playing',    onPlaying);
    video.addEventListener('canplay',    onCanPlay);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('ended',      onEnded);
    video.addEventListener('error',      onError);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('durationchange', onDurationChange);
  }

  function onPlay() {
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
    tapIcon.textContent = '⏸';
    scheduleHideControls();
    // Start saving position
    clearInterval(savePositionTimer);
    savePositionTimer = setInterval(savePosition, SAVE_POSITION_INTERVAL);
  }

  function onPause() {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    tapIcon.textContent = '▶';
    showControls();
    clearInterval(savePositionTimer);
  }

  function onTimeUpdate() {
    if (isProgressDragging) return;
    const pct = video.duration ? (video.currentTime / video.duration) * 100 : 0;
    progressPlayed.style.width = pct + '%';
    progressThumb.style.left = pct + '%';
    currentTimeEl.textContent = Utils.formatTime(video.currentTime);
  }

  function onBufferUpdate() {
    if (!video.duration) return;
    let buffered = 0;
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= video.currentTime) {
        buffered = video.buffered.end(i);
      }
    }
    progressBuffered.style.width = ((buffered / video.duration) * 100) + '%';
  }

  function onWaiting()  { showSpinner(); }
  function onPlaying()  { hideSpinner(); }
  function onCanPlay()  { hideSpinner(); }

  function onLoadedMetadata() {
    totalTimeEl.textContent = Utils.formatTime(video.duration);
    hideSpinner();
    // Auto-play
    video.play().catch(() => {
      // Autoplay blocked — user needs to tap
    });
  }

  function onDurationChange() {
    if (video.duration && isFinite(video.duration)) {
      totalTimeEl.textContent = Utils.formatTime(video.duration);
    }
  }

  function onEnded() {
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    showControls();
    savePosition();
    clearInterval(savePositionTimer);
  }

  function onError() {
    hideSpinner();
    const err = video.error;
    if (!err) return;
    let msg = 'Playback error.';
    switch (err.code) {
      case MediaError.MEDIA_ERR_ABORTED:    msg = 'Playback aborted.'; break;
      case MediaError.MEDIA_ERR_NETWORK:    msg = 'Network error — check your connection or URL.'; break;
      case MediaError.MEDIA_ERR_DECODE:     msg = 'Codec error — this format may not be supported by your browser. Try Chrome or Firefox.'; break;
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: msg = 'Format not supported. Try MP4/H.264 for best compatibility.'; break;
    }
    window.StreamApp?.showError(msg);
  }

  function onVolumeChange() {
    if (video.muted || video.volume === 0) {
      volIcon.classList.add('hidden');
      muteIcon.classList.remove('hidden');
    } else {
      volIcon.classList.remove('hidden');
      muteIcon.classList.add('hidden');
    }
    volumeSlider.value = video.muted ? 0 : video.volume;
  }

  // ─── Controls ──────────────────────────────────────────────────
  function bindControlEvents() {
    playPauseBtn.addEventListener('click', togglePlayPause);
    rewindBtn.addEventListener('click',   () => seekRelative(-SEEK_SECONDS));
    forwardBtn.addEventListener('click',  () => seekRelative(SEEK_SECONDS));
    muteBtn.addEventListener('click',     toggleMute);
    volumeSlider.addEventListener('input', () => {
      video.volume = parseFloat(volumeSlider.value);
      video.muted = video.volume === 0;
    });
    backBtn.addEventListener('click', goBack);
    pipBtn.addEventListener('click', togglePiP);
  }

  function togglePlayPause() {
    if (video.paused || video.ended) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }

  function seekRelative(delta) {
    video.currentTime = Utils.clamp(video.currentTime + delta, 0, video.duration || 0);
  }

  function seekTo(pct) {
    if (!video.duration) return;
    video.currentTime = Utils.clamp(pct * video.duration, 0, video.duration);
  }

  function toggleMute() {
    video.muted = !video.muted;
  }

  async function togglePiP() {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (e) {
      console.warn('PiP not supported:', e);
    }
  }

  function goBack() {
    // Pause, destroy HLS, and return to hero
    video.pause();
    destroyHLS();
    clearInterval(savePositionTimer);
    SubtitleManager.clear();
    savePosition();
    window.StreamApp?.returnToHero();
  }

  // ─── Speed Menu ────────────────────────────────────────────────
  function buildSpeedMenu() {
    SPEEDS.forEach(speed => {
      const div = document.createElement('div');
      div.className = 'menu-item' + (speed === 1 ? ' active' : '');
      div.innerHTML = `<span>${speed}×</span><svg class="check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
      div.addEventListener('click', () => setSpeed(speed));
      speedItems.appendChild(div);
    });
  }

  function setSpeed(speed) {
    activeSpeed = speed;
    video.playbackRate = speed;
    speedLabel.textContent = speed + '×';
    speedItems.querySelectorAll('.menu-item').forEach((el, i) => {
      el.classList.toggle('active', SPEEDS[i] === speed);
    });
    closeAllMenus();
  }

  // ─── Progress / Seek ───────────────────────────────────────────
  function bindProgressEvents() {
    // Mouse events
    progressBar.addEventListener('mousedown', onProgressStart);
    document.addEventListener('mousemove',   onProgressMove);
    document.addEventListener('mouseup',     onProgressEnd);

    // Touch events
    progressBar.addEventListener('touchstart', onProgressTouchStart, { passive: false });
    document.addEventListener('touchmove',  onProgressTouchMove, { passive: false });
    document.addEventListener('touchend',   onProgressTouchEnd);
  }

  function onProgressStart(e) {
    isProgressDragging = true;
    progressBar.classList.add('dragging');
    updateProgressFromEvent(e);
  }

  function onProgressMove(e) {
    if (!isProgressDragging) return;
    updateProgressFromEvent(e);
  }

  function onProgressEnd() {
    if (!isProgressDragging) return;
    isProgressDragging = false;
    progressBar.classList.remove('dragging');
    // Seek to the shown position
    const pct = parseFloat(progressPlayed.style.width) / 100;
    seekTo(pct);
  }

  function onProgressTouchStart(e) {
    e.preventDefault();
    isProgressDragging = true;
    progressBar.classList.add('dragging');
    updateProgressFromTouch(e.touches[0]);
  }

  function onProgressTouchMove(e) {
    if (!isProgressDragging) return;
    e.preventDefault();
    updateProgressFromTouch(e.touches[0]);
  }

  function onProgressTouchEnd() {
    if (!isProgressDragging) return;
    isProgressDragging = false;
    progressBar.classList.remove('dragging');
    const pct = parseFloat(progressPlayed.style.width) / 100;
    seekTo(pct);
  }

  function updateProgressFromEvent(e) {
    const rect = progressBar.getBoundingClientRect();
    const pct = Utils.clamp((e.clientX - rect.left) / rect.width, 0, 1);
    progressPlayed.style.width = (pct * 100) + '%';
    progressThumb.style.left = (pct * 100) + '%';
    currentTimeEl.textContent = Utils.formatTime(pct * (video.duration || 0));
  }

  function updateProgressFromTouch(touch) {
    const rect = progressBar.getBoundingClientRect();
    const pct = Utils.clamp((touch.clientX - rect.left) / rect.width, 0, 1);
    progressPlayed.style.width = (pct * 100) + '%';
    progressThumb.style.left = (pct * 100) + '%';
    currentTimeEl.textContent = Utils.formatTime(pct * (video.duration || 0));
  }

  // ─── Gesture Events (touch on video) ──────────────────────────
  function bindGestureEvents() {
    // Touch events on gesture zones (double-tap seek)
    gestureLeft.addEventListener('touchend',  (e) => handleZoneTap(e, 'left'),  { passive: false });
    gestureRight.addEventListener('touchend', (e) => handleZoneTap(e, 'right'), { passive: false });

    // Touch on main wrapper (show/hide controls + single tap play/pause)
    wrapper.addEventListener('touchstart', onWrapperTouchStart, { passive: true });
    wrapper.addEventListener('touchend',   onWrapperTouchEnd,   { passive: false });

    // Mouse click on wrapper (desktop)
    wrapper.addEventListener('click', onWrapperClick);
  }

  let wrapperTouchStartX = 0;
  let wrapperTouchStartY = 0;
  let wrapperTouchMoved = false;

  function onWrapperTouchStart(e) {
    wrapperTouchStartX = e.touches[0].clientX;
    wrapperTouchStartY = e.touches[0].clientY;
    wrapperTouchMoved = false;
  }

  function onWrapperTouchEnd(e) {
    const dx = Math.abs(e.changedTouches[0].clientX - wrapperTouchStartX);
    const dy = Math.abs(e.changedTouches[0].clientY - wrapperTouchStartY);
    if (dx > 10 || dy > 10) { wrapperTouchMoved = true; }

    if (!wrapperTouchMoved) {
      // Touched the center area (not gesture zones handled separately)
      showControlsTemporarily();
    }
  }

  function onWrapperClick() {
    if (Utils.isMobile()) return; // mobile uses touch
    showControlsTemporarily();
  }

  /**
   * Handle tap on gesture zone (left/right) for double-tap seek
   */
  function handleZoneTap(e, zone) {
    e.preventDefault(); // prevent click firing

    const now = Date.now();
    const dt = now - lastTapTime;

    if (dt < 300 && lastTapZone === zone) {
      // Double tap!
      clearTimeout(tapTimer);
      tapTimer = null;
      tapCount++;

      const amount = tapCount === 1 ? SEEK_SECONDS : SEEK_SECONDS * tapCount;
      const delta = zone === 'right' ? SEEK_SECONDS : -SEEK_SECONDS;
      seekRelative(delta);

      const ripple = zone === 'left' ? rippleLeft : rippleRight;
      const label  = zone === 'left' ? seekLabelLeft : seekLabelRight;
      const totalSeek = Math.abs(delta);
      label.textContent = (zone === 'right' ? '+' : '-') + totalSeek + 's';
      showRipple(ripple);
      lastTapTime = now;
    } else {
      // First tap — wait to see if double tap
      tapCount = 0;
      lastTapZone = zone;
      lastTapTime = now;
      tapTimer = setTimeout(() => {
        // Single tap on zone — show controls
        showControlsTemporarily();
        tapTimer = null;
      }, 280);
    }
  }

  function showRipple(rippleEl) {
    rippleEl.classList.add('show');
    clearTimeout(rippleEl._hideTimer);
    rippleEl._hideTimer = setTimeout(() => {
      rippleEl.classList.remove('show');
    }, 700);
  }

  // ─── Controls Show/Hide ───────────────────────────────────────
  function showControls() {
    overlay.classList.remove('hidden-controls');
    clearTimeout(controlsTimeout);
  }

  function scheduleHideControls() {
    clearTimeout(controlsTimeout);
    if (!video.paused) {
      controlsTimeout = setTimeout(hideControls, CONTROLS_HIDE_DELAY);
    }
  }

  function hideControls() {
    if (video.paused) return;
    closeAllMenus();
    overlay.classList.add('hidden-controls');
  }

  function showControlsTemporarily() {
    showControls();
    scheduleHideControls();
    // Also toggle play/pause on single tap
    if (overlay.classList.contains('hidden-controls') === false) {
      // Controls were already visible — just keep showing
    }
  }

  // Reset hide timer on any interaction in overlay
  overlay?.addEventListener('touchstart', () => {
    showControls();
    scheduleHideControls();
  }, { passive: true });

  overlay?.addEventListener('mousemove', Utils.throttle(() => {
    showControls();
    scheduleHideControls();
  }, 200));

  // ─── Menus ─────────────────────────────────────────────────────
  function bindMenuEvents() {
    speedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu(speedMenu);
    });

    audioBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu(audioMenu);
    });

    subtitleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu(subtitleMenu);
    });

    // Close menus on outside click
    wrapper.addEventListener('click', (e) => {
      const target = e.target;
      if (!speedMenu.contains(target) && target !== speedBtn) speedMenu.classList.add('hidden');
      if (!audioMenu.contains(target) && target !== audioBtn) audioMenu.classList.add('hidden');
      if (!subtitleMenu.contains(target) && target !== subtitleBtn) subtitleMenu.classList.add('hidden');
    });
  }

  function toggleMenu(menu) {
    const isHidden = menu.classList.contains('hidden');
    closeAllMenus();
    if (isHidden) {
      menu.classList.remove('hidden');
      showControls(); // Keep controls visible while menu is open
    }
  }

  function closeAllMenus() {
    speedMenu.classList.add('hidden');
    audioMenu.classList.add('hidden');
    subtitleMenu.classList.add('hidden');
  }

  // ─── Keyboard Shortcuts ────────────────────────────────────────
  function bindKeyboardEvents() {
    document.addEventListener('keydown', (e) => {
      // Only when player is visible
      if (document.getElementById('player-section').classList.contains('hidden')) return;
      // Ignore if typing in an input
      if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;

      switch(e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          togglePlayPause();
          flashTapIndicator();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekRelative(-SEEK_SECONDS);
          showRipple(rippleLeft);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekRelative(SEEK_SECONDS);
          showRipple(rippleRight);
          break;
        case 'ArrowUp':
          e.preventDefault();
          video.volume = Utils.clamp(video.volume + 0.1, 0, 1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          video.volume = Utils.clamp(video.volume - 0.1, 0, 1);
          break;
        case 'KeyM':
          toggleMute();
          break;
        case 'KeyF':
          toggleFullscreen();
          break;
        case 'KeyP':
          togglePiP();
          break;
        case 'Escape':
          if (Utils.isFullscreen()) Utils.exitFullscreen();
          break;
      }
      showControlsTemporarily();
    });
  }

  function flashTapIndicator() {
    tapIcon.textContent = video.paused ? '▶' : '⏸';
    tapIndicator.classList.add('show');
    clearTimeout(tapIndicator._timer);
    tapIndicator._timer = setTimeout(() => tapIndicator.classList.remove('show'), 500);
  }

  // ─── Fullscreen ────────────────────────────────────────────────
  function bindFullscreenEvents() {
    fullscreenBtn.addEventListener('click', toggleFullscreen);

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('mozfullscreenchange', onFullscreenChange);
  }

  async function toggleFullscreen() {
    try {
      if (Utils.isFullscreen()) {
        await Utils.exitFullscreen();
      } else {
        await Utils.requestFullscreen(wrapper);
      }
    } catch (e) {
      // Fallback: CSS-based fullscreen
      wrapper.classList.toggle('css-fullscreen');
      document.body.classList.toggle('fullscreen-active');
      updateFsIcons(!Utils.isFullscreen());
    }
  }

  function onFullscreenChange() {
    const isFs = Utils.isFullscreen();
    document.body.classList.toggle('fullscreen-active', isFs);
    fsIcon.classList.toggle('hidden', isFs);
    exitFsIcon.classList.toggle('hidden', !isFs);

    if (isFs) {
      // Lock landscape on mobile if possible
      try {
        screen.orientation?.lock('landscape').catch(() => {});
      } catch {}
    } else {
      try {
        screen.orientation?.unlock();
      } catch {}
    }
    scheduleHideControls();
  }

  function updateFsIcons(isFs) {
    fsIcon.classList.toggle('hidden', isFs);
    exitFsIcon.classList.toggle('hidden', !isFs);
  }

  // ─── Spinner ───────────────────────────────────────────────────
  function showSpinner() { spinner.classList.remove('hidden'); }
  function hideSpinner() { spinner.classList.add('hidden'); }

  // ─── HLS Cleanup ──────────────────────────────────────────────
  function destroyHLS() {
    if (hls) {
      hls.destroy();
      hls = null;
    }
  }

  // ─── Public API ────────────────────────────────────────────────
  function addExternalSubtitles() {
    // Called after SubtitleManager loads a file
    if (hls) populateSubtitleTracksHLS();
    else populateNativeSubtitleTracks();
  }

  function destroy() {
    destroyHLS();
    SubtitleManager.clear();
    clearInterval(savePositionTimer);
    clearTimeout(controlsTimeout);
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  return {
    init,
    load,
    destroy,
    addExternalSubtitles,
    seekRelative,
    togglePlayPause,
  };

})();
