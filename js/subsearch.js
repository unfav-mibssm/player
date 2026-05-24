'use strict';

/* ════════════════════════════════════════════
   SUBSEARCH.JS
   Searches subtitles from two sources:
   1. subdl.com  — free, no key, unlimited
   2. OpenSubtitles.com — 3 API keys, rotated
   Language: English (en)
   ════════════════════════════════════════════ */

const SubSearch = (() => {

  /* ── OpenSubtitles API keys (rotated) ── */
  const OS_KEYS = [
    'OMJJbBucCuXXhW5otJE9QtVYU4KjJB8P',
    'hdOF9qTu5LNrliZ2GqBufryi0rcpUTtc',
    'R1HyniBWAlwQlni2K9yYAOnvlUk0TS9j'
  ];
  let _keyIndex = 0;

  function nextKey() {
    const key = OS_KEYS[_keyIndex % OS_KEYS.length];
    _keyIndex++;
    return key;
  }

  /* ════ SUBDL SEARCH (primary — free, no key) ════ */
  async function searchSubdl(query) {
    const url = `https://api.subdl.com/api/v1/subtitles?api_key=free&query=${encodeURIComponent(query)}&languages=en&type=movie,tv`;
    try {
      const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error('subdl returned ' + res.status);
      const data = await res.json();
      if (!data.subtitles || data.subtitles.length === 0) return [];
      return data.subtitles.slice(0, 10).map(s => ({
        source:    'subdl',
        id:        s.sd_id || s.slug,
        name:      s.release_name || s.name || 'Unknown',
        downloads: s.downloads || 0,
        rating:    s.rating || null,
        url:       s.url || null,        // direct SRT link if available
        slug:      s.slug,
        lang:      'en'
      }));
    } catch (e) {
      console.warn('subdl search failed:', e.message);
      return [];
    }
  }

  /* ════ OPENSUBTITLES SEARCH (fallback) ════ */
  async function searchOS(query) {
    const key = nextKey();
    const url = `https://api.opensubtitles.com/api/v1/subtitles?query=${encodeURIComponent(query)}&languages=en&order_by=download_count&order_direction=desc`;
    try {
      const res  = await fetch(url, {
        headers: {
          'Api-Key':      key,
          'Content-Type': 'application/json',
          'X-User-Agent': 'mibsam-player v1.0'
        },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) throw new Error('OS returned ' + res.status);
      const data = await res.json();
      if (!data.data || data.data.length === 0) return [];
      return data.data.slice(0, 10).map(s => ({
        source:    'opensubtitles',
        id:        s.id,
        name:      s.attributes?.release || s.attributes?.feature_details?.movie_name || 'Unknown',
        downloads: s.attributes?.download_count || 0,
        rating:    s.attributes?.ratings || null,
        fileId:    s.attributes?.files?.[0]?.file_id || null,
        lang:      'en'
      }));
    } catch (e) {
      console.warn('OpenSubtitles search failed:', e.message);
      return [];
    }
  }

  /* ════ COMBINED SEARCH ════ */
  async function search(query) {
    // Run both in parallel
    const [subdlResults, osResults] = await Promise.all([
      searchSubdl(query),
      searchOS(query)
    ]);

    // Merge — subdl first (free), then OS
    const combined = [...subdlResults, ...osResults];
    if (combined.length === 0) throw new Error('No subtitles found. Try a different title.');
    return combined;
  }

  /* ════ DOWNLOAD FROM SUBDL ════ */
  async function downloadSubdl(item) {
    // subdl gives a direct URL like https://dl.subdl.com/...zip or .srt
    if (!item.slug) throw new Error('No slug for subdl download.');

    // Try direct SRT URL first
    const directUrl = `https://dl.subdl.com/subtitle/${item.slug}.srt`;
    try {
      const res = await fetch(directUrl, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const text = await res.text();
        if (text.includes('-->') || /^\d+\s*\n/.test(text)) {
          return { text, type: 'srt' };
        }
      }
    } catch {}

    // Fallback: try the zip endpoint
    const zipUrl = `https://dl.subdl.com/subtitle/${item.slug}.zip`;
    const res = await fetch(zipUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error('Failed to download from subdl.');
    // Return as blob — caller handles zip extraction
    const blob = await res.blob();
    return { blob, type: 'zip' };
  }

  /* ════ DOWNLOAD FROM OPENSUBTITLES ════ */
  async function downloadOS(item) {
    if (!item.fileId) throw new Error('No file ID for this subtitle.');
    const key = nextKey();

    // Step 1: Request download link
    const linkRes = await fetch('https://api.opensubtitles.com/api/v1/download', {
      method: 'POST',
      headers: {
        'Api-Key':      key,
        'Content-Type': 'application/json',
        'X-User-Agent': 'mibsam-player v1.0'
      },
      body: JSON.stringify({ file_id: item.fileId }),
      signal: AbortSignal.timeout(10000)
    });

    if (!linkRes.ok) {
      const err = await linkRes.json().catch(() => ({}));
      throw new Error(err.message || 'Download request failed (quota may be reached).');
    }

    const linkData = await linkRes.json();
    const dlUrl = linkData.link;
    if (!dlUrl) throw new Error('No download link returned.');

    // Step 2: Fetch the actual subtitle file
    const fileRes = await fetch(dlUrl, { signal: AbortSignal.timeout(15000) });
    if (!fileRes.ok) throw new Error('Could not download subtitle file.');
    const text = await fileRes.text();
    const type = dlUrl.toLowerCase().includes('.vtt') ? 'vtt' : 'srt';
    return { text, type };
  }

  /* ════ MAIN DOWNLOAD ════ */
  async function download(item) {
    if (item.source === 'subdl') {
      return await downloadSubdl(item);
    } else {
      return await downloadOS(item);
    }
  }

  return { search, download };
})();
