'use strict';

const Subs = (() => {

  let _cues    = [];
  let _video   = null;
  let _display = null;
  let _raf     = null;
  let _enabled = false;
  let _lastText = null;

  function init(videoEl, displayEl) {
    _video   = videoEl;
    _display = displayEl;
  }

  /* ── SRT Parser ── */
  function parseSRT(raw) {
    const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const blocks = text.split(/\n{2,}/);
    const cues = [];
    for (const block of blocks) {
      const lines = block.split('\n');
      let ti = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('-->')) { ti = i; break; }
      }
      if (ti < 0) continue;
      const m = lines[ti].match(
        /(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/
      );
      if (!m) continue;
      const start = +m[1]*3600 + +m[2]*60 + +m[3] + +m[4]/1000;
      const end   = +m[5]*3600 + +m[6]*60 + +m[7] + +m[8]/1000;
      const body  = lines.slice(ti + 1)
        .map(l => l.replace(/<[^>]+>/g, '').trim())
        .filter(l => l.length > 0);
      if (body.length > 0) cues.push({ start, end, text: body.join('\n') });
    }
    return cues;
  }

  /* ── VTT Parser ── */
  function parseVTT(raw) {
    const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const stripped = text
      .replace(/^WEBVTT[^\n]*\n?/m, '')
      .replace(/NOTE[^\n]*\n[\s\S]*?(?=\n\n|$)/gm, '')
      .trim();
    const blocks = stripped.split(/\n{2,}/);
    const cues = [];
    for (const block of blocks) {
      const lines = block.split('\n');
      let ti = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('-->')) { ti = i; break; }
      }
      if (ti < 0) continue;
      const m = lines[ti].match(
        /(?:(\d+):)?(\d+):(\d+)\.(\d+)\s*-->\s*(?:(\d+):)?(\d+):(\d+)\.(\d+)/
      );
      if (!m) continue;
      const start = (+m[1]||0)*3600 + +m[2]*60 + +m[3] + +m[4]/1000;
      const end   = (+m[5]||0)*3600 + +m[6]*60 + +m[7] + +m[8]/1000;
      const body  = lines.slice(ti + 1)
        .map(l => l.replace(/<[^>]+>/g,'')
                   .replace(/&amp;/g,'&').replace(/&lt;/g,'<')
                   .replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').trim())
        .filter(l => l.length > 0);
      if (body.length > 0) cues.push({ start, end, text: body.join('\n') });
    }
    return cues;
  }

  /* ── Load from File ── */
  function loadFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject('No file provided.');
      const ext = file.name.toLowerCase().split('.').pop();
      if (!['srt','vtt'].includes(ext)) return reject('Only .srt or .vtt files are supported.');
      const reader = new FileReader();
      reader.onerror = () => reject('Could not read the file.');
      reader.onload  = (e) => {
        try {
          const raw  = e.target.result;
          const cues = ext === 'vtt' ? parseVTT(raw) : parseSRT(raw);
          if (cues.length === 0) return reject('No subtitle cues found in this file.');
          _cues = cues;
          resolve(cues.length);
        } catch(err) {
          reject('Parse error: ' + (err.message || err));
        }
      };
      reader.readAsText(file, 'UTF-8');
    });
  }

  /* ── Load from text string (used by subtitle search download) ── */
  function loadText(text, type) {
    try {
      const cues = type === 'vtt' ? parseVTT(text) : parseSRT(text);
      if (cues.length === 0) throw new Error('No cues found.');
      _cues = cues;
      return cues.length;
    } catch(e) {
      throw new Error('Could not parse subtitle: ' + e.message);
    }
  }

  /* ── Binary search for active cue ── */
  function findCue(t) {
    let lo = 0, hi = _cues.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = _cues[mid];
      if      (t < c.start) hi = mid - 1;
      else if (t >= c.end)  lo = mid + 1;
      else return c;
    }
    return null;
  }

  /* ── Render loop ── */
  function _loop() {
    if (!_enabled || !_video || !_display) return;
    const cue     = findCue(_video.currentTime);
    const newText = cue ? cue.text : '';
    if (newText !== _lastText) {
      _lastText = newText;
      _display.innerHTML = newText
        ? `<span class="sub-line">${newText.replace(/\n/g,'<br>')}</span>`
        : '';
    }
    _raf = requestAnimationFrame(_loop);
  }

  function enable() {
    if (_cues.length === 0) return;
    _enabled  = true;
    _lastText = null;
    if (_raf) cancelAnimationFrame(_raf);
    _raf = requestAnimationFrame(_loop);
  }

  function disable() {
    _enabled  = false;
    _lastText = null;
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
    if (_display) _display.innerHTML = '';
  }

  function clear() {
    disable();
    _cues = [];
  }

  function isLoaded()  { return _cues.length > 0; }
  function isEnabled() { return _enabled; }
  function cueCount()  { return _cues.length; }

  return { init, loadFile, loadText, enable, disable, clear, isLoaded, isEnabled, cueCount };
})();
