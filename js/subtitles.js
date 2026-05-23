/* ============================================
   StreamVault — subtitles.js
   Subtitle parsing (SRT/VTT) and rendering
   ============================================ */

'use strict';

const SubtitleManager = (() => {

  // State
  let cues = [];          // Parsed subtitle cues: {start, end, text}
  let activeTrackIndex = -1; // -1 = off, 0+ = cue index
  let externalCues = null;  // From uploaded file
  let videoEl = null;
  let containerEl = null;
  let subEl = null;
  let animFrame = null;

  // Style settings
  let settings = {
    fontSize: 100,   // percentage
    opacity: 90,
    background: 'rgba(0,0,0,0.75)'
  };

  /**
   * Initialize with DOM references
   */
  function init(video, container, subDisplay) {
    videoEl = video;
    containerEl = container;
    subEl = subDisplay;
  }

  /**
   * Parse SRT string into cue array
   */
  function parseSRT(text) {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const blocks = normalized.split(/\n\n+/);
    const result = [];

    for (const block of blocks) {
      const lines = block.split('\n');
      // Find time line
      let timeLine = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('-->')) { timeLine = i; break; }
      }
      if (timeLine < 0) continue;

      const times = lines[timeLine].match(
        /(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/
      );
      if (!times) continue;

      const start = toSeconds(times[1], times[2], times[3], times[4]);
      const end   = toSeconds(times[5], times[6], times[7], times[8]);
      const text  = lines.slice(timeLine + 1).join('\n')
                         .replace(/<[^>]+>/g, '') // strip HTML tags
                         .trim();

      if (text) result.push({ start, end, text });
    }

    return result;
  }

  /**
   * Parse VTT string into cue array
   */
  function parseVTT(text) {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    // Remove WEBVTT header line
    const content = normalized.replace(/^WEBVTT.*\n?/, '').trim();
    const blocks = content.split(/\n\n+/);
    const result = [];

    for (const block of blocks) {
      const lines = block.split('\n');
      let timeLine = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('-->')) { timeLine = i; break; }
      }
      if (timeLine < 0) continue;

      const times = lines[timeLine].match(
        /(?:(\d+):)?(\d+):(\d+)\.(\d+)\s*-->\s*(?:(\d+):)?(\d+):(\d+)\.(\d+)/
      );
      if (!times) continue;

      const start = toSecondsVTT(times[1], times[2], times[3], times[4]);
      const end   = toSecondsVTT(times[5], times[6], times[7], times[8]);
      const text  = lines.slice(timeLine + 1).join('\n')
                         .replace(/<[^>]+>/g, '')
                         .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
                         .replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
                         .trim();

      if (text) result.push({ start, end, text });
    }

    return result;
  }

  function toSeconds(h, m, s, ms) {
    return parseInt(h)*3600 + parseInt(m)*60 + parseInt(s) + parseInt(ms)/1000;
  }

  function toSecondsVTT(h, m, s, ms) {
    // h may be undefined in VTT short form (MM:SS.mmm)
    const hours = h !== undefined ? parseInt(h) : 0;
    return hours*3600 + parseInt(m)*60 + parseInt(s) + parseInt(ms)/1000;
  }

  /**
   * Load from uploaded file (File object)
   */
  function loadFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        try {
          let parsed;
          if (file.name.toLowerCase().endsWith('.vtt')) {
            parsed = parseVTT(text);
          } else {
            parsed = parseSRT(text);
          }
          if (parsed.length === 0) {
            reject('No subtitle cues found in file.');
            return;
          }
          externalCues = parsed;
          cues = parsed;
          resolve(parsed.length);
        } catch(err) {
          reject('Failed to parse subtitle file: ' + err.message);
        }
      };
      reader.onerror = () => reject('Failed to read file.');
      reader.readAsText(file, 'UTF-8');
    });
  }

  /**
   * Load from URL (VTT only for fetch)
   */
  async function loadFromURL(url) {
    try {
      const resp = await fetch(url);
      const text = await resp.text();
      const parsed = text.startsWith('WEBVTT') ? parseVTT(text) : parseSRT(text);
      externalCues = parsed;
      cues = parsed;
      return parsed.length;
    } catch (err) {
      throw new Error('Failed to fetch subtitles: ' + err.message);
    }
  }

  /**
   * Use native video track (TextTrack)
   */
  function useNativeTrack(track) {
    // Extract cues from native TextTrack
    if (!track || !track.cues) return false;
    const result = [];
    for (const cue of track.cues) {
      result.push({
        start: cue.startTime,
        end: cue.endTime,
        text: cue.text || (cue.getCueAsHTML ? cue.getCueAsHTML().textContent : '')
      });
    }
    cues = result;
    return result.length > 0;
  }

  /**
   * Start rendering loop
   */
  function startRendering() {
    if (animFrame) cancelAnimationFrame(animFrame);
    renderLoop();
  }

  function renderLoop() {
    if (!videoEl || !subEl) return;
    const t = videoEl.currentTime;
    const cue = findCue(t);
    renderCue(cue ? cue.text : '');
    animFrame = requestAnimationFrame(renderLoop);
  }

  function stopRendering() {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    if (subEl) subEl.textContent = '';
  }

  function findCue(t) {
    for (const c of cues) {
      if (t >= c.start && t < c.end) return c;
    }
    return null;
  }

  function renderCue(text) {
    if (!subEl) return;
    if (!text) {
      subEl.textContent = '';
      return;
    }
    subEl.textContent = text;
    applyStyles();
  }

  function applyStyles() {
    if (!subEl) return;
    subEl.style.fontSize = `${settings.fontSize}%`;
    subEl.style.opacity = settings.opacity / 100;
    subEl.style.background = settings.background;
  }

  /**
   * Update settings
   */
  function updateSettings(newSettings) {
    Object.assign(settings, newSettings);
    applyStyles();
  }

  /**
   * Enable/disable subtitles
   */
  function enable() {
    if (cues.length > 0) startRendering();
  }

  function disable() {
    stopRendering();
  }

  /**
   * Clear loaded subtitles
   */
  function clear() {
    cues = [];
    externalCues = null;
    stopRendering();
  }

  /**
   * Get current cue count
   */
  function getCueCount() { return cues.length; }

  /**
   * Has loaded subtitles?
   */
  function hasSubtitles() { return cues.length > 0; }

  return {
    init,
    parseSRT,
    parseVTT,
    loadFromFile,
    loadFromURL,
    useNativeTrack,
    startRendering,
    stopRendering,
    enable,
    disable,
    clear,
    updateSettings,
    getCueCount,
    hasSubtitles
  };

})();
