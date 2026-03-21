const axios = require('axios');

let accessToken = null;
let tokenExpiry = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Spotify returns 429 when requests burst; respect Retry-After and back off.
 * @param {object} config - axios request config (e.g. `{ headers: { Authorization: 'Bearer …' } }`)
 */
async function spotifyGet(url, config = {}, { maxRetries = 5 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await axios.get(url, config);
    } catch (e) {
      const status = e.response?.status;
      if (status === 429 && attempt < maxRetries) {
        const ra = parseInt(e.response?.headers?.['retry-after'], 10);
        const waitMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(1500 * 2 ** attempt, 12000);
        await sleep(waitMs);
        attempt += 1;
        continue;
      }
      throw e;
    }
  }
}

async function getAccessToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  const response = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      auth: {
        username: process.env.SPOTIFY_CLIENT_ID,
        password: process.env.SPOTIFY_CLIENT_SECRET,
      },
    }
  );

  accessToken = response.data.access_token;
  tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
  return accessToken;
}

/** Rough genre hint per country — drives search, not literal country-name queries */
const COUNTRY_GENRES = {
  US: 'hip-hop',
  GB: 'pop',
  BR: 'latin',
  NG: 'afrobeats',
  KR: 'k-pop',
  JP: 'j-pop',
  DE: 'electronic',
  FR: 'pop',
  MX: 'latin',
  IN: 'bollywood',
  AR: 'latin',
  ZA: 'afrobeats',
  AU: 'pop',
  ES: 'latin',
  IT: 'pop',
};

/** Map our labels → Spotify search genre tags */
const GENRE_TO_SEARCH_TAG = {
  'hip-hop': 'hip-hop',
  pop: 'pop',
  latin: 'latin',
  afrobeats: 'afrobeat',
  'k-pop': 'k-pop',
  'j-pop': 'j-pop',
  electronic: 'electronic',
  bollywood: 'indian',
};

const MARKET_FALLBACK = 'US';

const COMPILATION_BAD = /mixtape|compilation|various artists|karaoke/i;

function isProperTrack(item) {
  if (!item?.id) return false;
  const albumType = item.album?.album_type;
  if (albumType === 'compilation') return false;
  const artist = item.artists?.[0]?.name ?? '';
  if (/^Various Artists$/i.test(artist)) return false;
  const trackName = item.name ?? '';
  const albumName = item.album?.name ?? '';
  if (COMPILATION_BAD.test(trackName) || COMPILATION_BAD.test(albumName)) return false;
  return true;
}

function mapTrack(item) {
  if (!item?.id) return null;
  return {
    id: item.id,
    name: item.name,
    artist: item.artists?.[0]?.name ?? 'Unknown',
    preview_url: item.preview_url ?? null,
    spotify_url: item.external_urls?.spotify ?? `https://open.spotify.com/track/${item.id}`,
    popularity: typeof item.popularity === 'number' ? item.popularity : 0,
  };
}

function dedupeById(tracks) {
  const seen = new Set();
  return tracks.filter((t) => {
    if (!t?.id || seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

function effectiveMarket(countryCode) {
  const c = countryCode.toUpperCase();
  const invalid = new Set(['AQ', 'BV', 'HM', 'TF']);
  if (invalid.has(c)) return MARKET_FALLBACK;
  return c;
}

function primaryGenreTag(countryCode) {
  const internal = COUNTRY_GENRES[countryCode.toUpperCase()] || 'pop';
  return GENRE_TO_SEARCH_TAG[internal] || internal;
}

/**
 * Several genre/year queries (no country name) so results feel like music from that market,
 * not novelty songs titled after the place.
 */
function buildSearchQueries(countryCode) {
  const code = countryCode.toUpperCase();
  const internal = COUNTRY_GENRES[code] || 'pop';
  const tag = primaryGenreTag(code);
  const y = new Date().getFullYear();
  const y1 = y - 1;
  const y2 = y - 2;

  /** Keyword search (not “India” the country name as sole query — uses scene + year) */
  if (internal === 'bollywood') {
    return [
      `bollywood year:${y}`,
      `hindi year:${y}`,
      `punjabi year:${y1}`,
    ];
  }

  const latin = [
    `genre:${tag} year:${y}`,
    `genre:reggaeton year:${y}`,
    `genre:latin-pop year:${y1}`,
  ];
  const hiphop = [`genre:${tag} year:${y}`, `genre:rap year:${y1}`, `genre:hip-hop year:${y2}`];
  const pop = [`genre:pop year:${y}`, `genre:indie year:${y1}`, `genre:dance year:${y}`];
  const kpop = [`genre:k-pop year:${y}`, `genre:k-pop year:${y1}`,
  ];
  const jpop = [`genre:j-pop year:${y}`, `genre:j-pop year:${y1}`,
  ];
  const electronic = [`genre:electronic year:${y}`, `genre:house year:${y1}`, `genre:techno year:${y}`];
  const afro = [`genre:afrobeat year:${y}`, `genre:afrobeat year:${y1}`, `genre:hip-hop year:${y}`];

  if (tag === 'latin') return latin;
  if (tag === 'hip-hop') return hiphop;
  if (tag === 'k-pop') return kpop;
  if (tag === 'j-pop') return jpop;
  if (tag === 'electronic') return electronic;
  if (tag === 'afrobeat') return afro;
  return pop;
}

async function searchTracks(token, q, market, limit, filterCompilations = false) {
  const requestLimit = filterCompilations ? Math.min(limit * 3, 50) : limit;
  const url =
    `https://api.spotify.com/v1/search?` +
    new URLSearchParams({
      q,
      type: 'track',
      market,
      limit: String(requestLimit),
    });
  const { data } = await spotifyGet(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let items = data.tracks?.items || [];
  if (filterCompilations) {
    items = items.filter(isProperTrack);
  }
  return items.slice(0, limit).map(mapTrack).filter(Boolean);
}

/**
 * Tracks trending in that market: genre + year searches (no country name),
 * merged, deduped, sorted by Spotify popularity.
 */
const BETWEEN_SEARCH_MS = 180;

async function getTopTracksForCountry(countryCode) {
  const token = await getAccessToken();
  const market = effectiveMarket(countryCode);
  const queries = buildSearchQueries(countryCode.toUpperCase());
  const perQuery = 4;

  // Sequential searches avoid bursting Spotify’s rate limit (parallel calls often yield 429).
  const batches = [];
  for (let i = 0; i < queries.length; i += 1) {
    if (i > 0) await sleep(BETWEEN_SEARCH_MS);
    try {
      batches.push(await searchTracks(token, queries[i], market, perQuery, true));
    } catch {
      batches.push([]);
    }
  }

  let flat = batches.flat();
  flat = dedupeById(flat);
  flat.sort((a, b) => b.popularity - a.popularity);

  const out = flat.slice(0, 10).map(({ popularity: _p, ...rest }) => rest);

  if (out.length >= 5) return out;

  // Last resort: single broad genre search in market
  try {
    await sleep(BETWEEN_SEARCH_MS);
    const tag = primaryGenreTag(countryCode);
    const extra = await searchTracks(token, `genre:${tag}`, market, 10, true);
    const merged = dedupeById([...flat.map((t) => ({ ...t, popularity: t.popularity ?? 0 })), ...extra]);
    merged.sort((a, b) => b.popularity - a.popularity);
    return merged.slice(0, 10).map(({ popularity: _p, ...rest }) => rest);
  } catch (e) {
    console.error('getTopTracksForCountry fallback failed:', e.response?.data || e.message);
    return out;
  }
}

async function createPlaylist(name, description, trackUris) {
  const token = await getAccessToken();

  const playlistResponse = await axios.post(
    'https://api.spotify.com/v1/me/playlists',
    { name, description, public: true },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const playlistId = playlistResponse.data.id;

  await axios.post(
    `https://api.spotify.com/v1/playlists/${playlistId}/items`,
    { uris: trackUris },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return playlistResponse.data.external_urls.spotify;
}

function buildMoodSearchQueries(energy, valence) {
  const v = valence;
  const e = energy;
  const y = new Date().getFullYear();
  if (v > 0.65 && e > 0.6) {
    return [`upbeat pop year:${y}`, `feel good hits year:${y}`, `happy pop year:${y - 1}`];
  }
  if (v < 0.4 && e < 0.5) {
    return [`sad acoustic year:${y}`, `mellow ballads year:${y}`, `emotional songs year:${y - 1}`];
  }
  return [`chill pop year:${y}`, `relaxing music year:${y}`, `indie pop year:${y - 1}`];
}

async function runSearchesSequential(token, queries, market, limit, filterCompilations) {
  const batches = [];
  for (let i = 0; i < queries.length; i += 1) {
    if (i > 0) await sleep(BETWEEN_SEARCH_MS);
    try {
      batches.push(await searchTracks(token, queries[i], market, limit, filterCompilations));
    } catch {
      batches.push([]);
    }
  }
  return batches;
}

async function getTracksByMood(energy, valence, danceability) {
  const e = Math.max(0.1, Math.min(1, energy));
  const v = Math.max(0.1, Math.min(1, valence));

  const token = await getAccessToken();
  const queries = buildMoodSearchQueries(e, v);
  const markets = ['US', 'GB', 'CA', 'AU'];

  for (const market of markets) {
    const batches = await runSearchesSequential(token, queries, market, 10, true);
    let flat = batches.flat();
    flat = dedupeById(flat);
    flat = flat.filter((t) => t.preview_url);
    flat.sort((a, b) => b.popularity - a.popularity);
    if (flat.length > 0) return flat.slice(0, 10);
  }

  for (const market of markets) {
    const batches = await runSearchesSequential(token, queries, market, 15, false);
    let flat = batches.flat();
    flat = dedupeById(flat);
    flat = flat.filter((t) => t.preview_url);
    flat.sort((a, b) => b.popularity - a.popularity);
    if (flat.length > 0) return flat.slice(0, 10);
  }

  const moodCountries = [
    { e: 0.8, v: 0.7, code: 'US' },
    { e: 0.6, v: 0.8, code: 'BR' },
    { e: 0.7, v: 0.7, code: 'GB' },
    { e: 0.7, v: 0.6, code: 'CA' },
  ];
  for (const { code } of moodCountries) {
    const fallback = await getTopTracksForCountry(code);
    const withPreview = fallback.filter((t) => t.preview_url);
    if (withPreview.length > 0) return withPreview.slice(0, 10);
  }
  return [];
}

/** Strip typical YouTube cruft so Spotify search matches real songs */
function cleanYoutubeTitleForSearch(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.replace(/\s+/g, ' ').trim();
  const patterns = [
    /\s*[\[(](official\s*)?(music\s*)?video[\])]/gi,
    /\s*[\[(]official\s*audio[\])]/gi,
    /\s*[\[(]lyrics?[\])]/gi,
    /\s*[\[(](hd|4k|8k)[\])]/gi,
    /\s*[\[(]visualizer[\])]/gi,
    /\s*\|\s*vertical\s*video/gi,
    /\s*#\w+/g,
    /\s*•\s*official.*$/i,
  ];
  for (const re of patterns) s = s.replace(re, ' ');
  s = s.replace(/\s*-\s*topic\s*$/i, '').trim();
  s = s.replace(/\s+/g, ' ').trim();
  return s.slice(0, 200);
}

function spotifySearchFragment(s) {
  return s.replace(/"/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
}

/** YouTube channel name is often the recording artist; skip obvious non-artist channels */
function channelLooksLikeArtist(name) {
  if (!name || name.length < 2 || name.length > 90) return false;
  return !/karaoke|nightcore|\b1\s*hour\b|\bmashup\b|cover\s*songs?|\blyrics?\s*only\b|fan\s*page|bootleg|\bplaylist\b|\bcompilation\b|tuning\s*music|audio\s*library|free\s*music|no\s*copyright/i.test(
    name,
  );
}

/** "Artist - Song" / "Song — Artist" style split (first separator wins) */
function splitYoutubeArtistTitle(cleaned) {
  if (!cleaned || cleaned.length < 4) return null;
  const seps = [' — ', ' – ', ' - ', ' | ', ' // ', ' / '];
  for (const sep of seps) {
    const i = cleaned.indexOf(sep);
    if (i === -1) continue;
    const left = cleaned.slice(0, i).trim();
    const right = cleaned.slice(i + sep.length).trim();
    if (left.length >= 2 && right.length >= 2) return { left, right };
  }
  return null;
}

/**
 * Build Spotify search attempts: field queries (track + artist) first, then plain title.
 * Compilation filter is often too strict for chart tracks — try unfiltered first.
 */
async function searchBestTrackForYoutubeTitle(token, market, rawTitle, channelTitle = '') {
  const cleaned = cleanYoutubeTitleForSearch(rawTitle);
  const rawTrim = (rawTitle || '').replace(/\s+/g, ' ').trim().slice(0, 160);

  const queries = [];

  const parts = splitYoutubeArtistTitle(cleaned);
  if (parts) {
    const a0 = spotifySearchFragment(parts.left);
    const a1 = spotifySearchFragment(parts.right);
    if (a0 && a1) {
      // YouTube is usually "Artist - Track"; try that first, then swapped
      queries.push(`track:"${a1}" artist:"${a0}"`);
      queries.push(`track:"${a0}" artist:"${a1}"`);
      queries.push(`${a0} ${a1}`);
      queries.push(`${a1} ${a0}`);
    }
  }

  const byMatch = cleaned.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) {
    const t = spotifySearchFragment(byMatch[1]);
    const a = spotifySearchFragment(byMatch[2]);
    if (t && a) queries.push(`track:"${t}" artist:"${a}"`);
  }

  const chRaw = cleanYoutubeTitleForSearch(channelTitle).replace(/\s*-\s*topic\s*$/i, '').trim();
  const ch = spotifySearchFragment(chRaw);
  if (ch && channelLooksLikeArtist(ch) && cleaned.length >= 3) {
    queries.push(`track:"${spotifySearchFragment(cleaned)}" artist:"${ch}"`);
    const beforeParen = cleaned.split('(')[0].trim();
    if (beforeParen.length >= 3 && beforeParen !== cleaned) {
      queries.push(`track:"${spotifySearchFragment(beforeParen)}" artist:"${ch}"`);
    }
  }

  if (cleaned.length >= 2) queries.push(cleaned);
  if (rawTrim.length >= 2 && rawTrim !== cleaned) queries.push(rawTrim);

  const seen = new Set();
  const unique = queries.filter((q) => {
    if (!q || seen.has(q)) return false;
    seen.add(q);
    return true;
  });

  for (let j = 0; j < unique.length; j += 1) {
    if (j > 0) await sleep(BETWEEN_SEARCH_MS);
    const q = unique[j];
    try {
      let results = await searchTracks(token, q, market, 12, false);
      if (results.length === 0) {
        await sleep(BETWEEN_SEARCH_MS / 2);
        results = await searchTracks(token, q, market, 12, true);
      }
      if (results.length > 0) {
        results.sort((a, b) => b.popularity - a.popularity);
        return { track: results[0], queryUsed: q };
      }
    } catch (e) {
      console.warn('Spotify search failed for query:', q.slice(0, 80), e.message);
    }
  }
  return { track: null, queryUsed: unique[0] || cleaned || '' };
}

/**
 * Map each Crystal session YouTube entry to the best-matching Spotify track (search by title).
 * Sequential requests to respect rate limits.
 * @param {{ videoId: string, title: string }[]} videos
 */
async function resolveCrystalSessionVideosToSpotify(videos, market = 'US') {
  const token = await getAccessToken();
  const out = [];
  const list = Array.isArray(videos) ? videos.slice(0, 40) : [];
  for (let i = 0; i < list.length; i += 1) {
    if (i > 0) await sleep(BETWEEN_SEARCH_MS);
    const v = list[i];
    try {
      const { track, queryUsed } = await searchBestTrackForYoutubeTitle(
        token,
        market,
        v.title || '',
        v.channelTitle || '',
      );
      out.push({
        videoId: v.videoId || '',
        youtubeTitle: v.title || '',
        searchQuery: queryUsed,
        spotify: track
          ? { id: track.id, name: track.name, artist: track.artist, spotify_url: track.spotify_url }
          : null,
      });
    } catch (err) {
      console.error('resolveCrystal row:', v.videoId, err.message);
      out.push({
        videoId: v.videoId || '',
        youtubeTitle: v.title || '',
        searchQuery: '',
        spotify: null,
      });
    }
  }
  return out;
}

module.exports = {
  getTopTracksForCountry,
  createPlaylist,
  getTracksByMood,
  COUNTRY_GENRES,
  resolveCrystalSessionVideosToSpotify,
};
