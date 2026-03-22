const {
  youtubeSearchWithFallback,
  getYoutubeApiKeys,
  formatYoutubeApiError,
  isYoutubeQuotaExceededError,
} = require('./youtube-search');
const {
  isAllowedYoutubeMusicVideo,
  isInstrumentalOrLofi,
  isGlobeDerivativeOrNoise,
  globeOfficialScore,
} = require('./youtube-filters');

/** Same country → genre hints as the former Spotify globe (search queries, not APIs). */
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

const GENRE_TO_SEARCH_TAG = {
  'hip-hop': 'hip hop',
  pop: 'pop',
  latin: 'latin',
  afrobeats: 'afrobeat',
  'k-pop': 'k-pop',
  'j-pop': 'j-pop',
  electronic: 'electronic',
  bollywood: 'bollywood',
};

const MARKET_FALLBACK = 'US';
const INVALID_REGION = new Set(['AQ', 'BV', 'HM', 'TF']);

function effectiveRegion(countryCode) {
  const c = countryCode.toUpperCase();
  if (INVALID_REGION.has(c)) return MARKET_FALLBACK;
  return c;
}

function primaryGenreTag(code) {
  const internal = COUNTRY_GENRES[code.toUpperCase()] || 'pop';
  return GENRE_TO_SEARCH_TAG[internal] || internal;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** One `search.list` costs 100 quota units regardless of maxResults — prefer fewer calls. */
const GLOBE_FIRST_PAGE = 50;
/** After the first search, only run the second query if we might not fill the top 10. */
const GLOBE_MIN_UNIQUE_BEFORE_SKIP_SECOND = 8;

function rankedUniqueFromItems(mergeItems) {
  const candidates = mergeItems
    .filter(isAllowedYoutubeMusicVideo)
    .filter((v) => !isInstrumentalOrLofi(v))
    .filter((v) => !isGlobeDerivativeOrNoise(v));

  const seen = new Set();
  const unique = [];
  for (const v of candidates) {
    const vid = v.id.videoId;
    if (!vid || seen.has(vid)) continue;
    seen.add(vid);
    unique.push(v);
  }

  unique.sort((a, b) => globeOfficialScore(b) - globeOfficialScore(a));
  return unique;
}

/**
 * @typedef {{ code: string, message: string }} GlobeVideosEmptyMeta
 * @returns {{ tracks: object[], meta: GlobeVideosEmptyMeta | null }}
 */
function emptyGlobeResult(meta) {
  return { tracks: [], meta };
}

function metaFromSearchError(err) {
  if (!err) return { code: 'YOUTUBE_ERROR', message: 'YouTube search failed.' };
  if (err.code === 'YOUTUBE_QUOTA_EXCEEDED' || isYoutubeQuotaExceededError(err)) {
    return {
      code: 'QUOTA_EXCEEDED',
      message:
        typeof err.message === 'string' && err.message.length > 20
          ? err.message
          : 'YouTube Data API quota exceeded on every key tried. Keys from the same Google Cloud project share one quota — use keys from different projects, or wait for reset / raise quota.',
    };
  }
  const detail = formatYoutubeApiError(err);
  return {
    code: 'YOUTUBE_ERROR',
    message: detail || 'YouTube Data API request failed. Check YOUTUBE_API_KEY and that YouTube Data API v3 is enabled.',
  };
}

/**
 * Region-aware YouTube search → up to 10 videos shaped like the old `tracks` array
 * (`id` = videoId, `name` = title, `artist` = channel, `youtube_url`).
 * On failure, `tracks` is empty and `meta` explains why (for /api/country error text).
 */
async function getTopVideosForCountry(countryCode) {
  if (getYoutubeApiKeys().length === 0) {
    return emptyGlobeResult({
      code: 'NO_API_KEY',
      message:
        'YouTube search is not configured: set YOUTUBE_API_KEY in server/.env (Google Cloud → enable YouTube Data API v3 → create an API key). Restart the server after saving.',
    });
  }

  const code = countryCode.toUpperCase();
  const internal = COUNTRY_GENRES[code] || 'pop';
  const tag = primaryGenreTag(code);
  const region = effectiveRegion(code);
  const y = new Date().getFullYear();

  /** @type {string[]} */
  const queries =
    internal === 'bollywood'
      ? [`bollywood songs ${y} official music video`, 'hindi songs official music video 2024']
      : [`${tag} music ${y} official music video`, `${tag} official music video`];

  /** @type {object[]} */
  const mergeItems = [];
  let lastSearchError = null;
  try {
    const data = await youtubeSearchWithFallback(queries[0], GLOBE_FIRST_PAGE, region);
    if (data?.items?.length) mergeItems.push(...data.items);
  } catch (e) {
    lastSearchError = e;
    console.warn('[YouTube globe] search failed:', queries[0].slice(0, 56), e.message);
  }

  let unique = rankedUniqueFromItems(mergeItems);

  if (unique.length < GLOBE_MIN_UNIQUE_BEFORE_SKIP_SECOND && queries.length > 1) {
    await sleep(400);
    try {
      const data = await youtubeSearchWithFallback(queries[1], GLOBE_FIRST_PAGE, region);
      if (data?.items?.length) mergeItems.push(...data.items);
    } catch (e) {
      lastSearchError = e;
      console.warn('[YouTube globe] search failed:', queries[1].slice(0, 56), e.message);
    }
    unique = rankedUniqueFromItems(mergeItems);
  }

  const tracks = unique.slice(0, 10).map((v) => ({
    id: v.id.videoId,
    name: v.snippet?.title || 'Video',
    artist: v.snippet?.channelTitle || '',
    preview_url: null,
    youtube_url: `https://www.youtube.com/watch?v=${v.id.videoId}`,
  }));

  if (tracks.length > 0) {
    return { tracks, meta: null };
  }

  if (mergeItems.length === 0) {
    if (lastSearchError) {
      return emptyGlobeResult(metaFromSearchError(lastSearchError));
    }
    return emptyGlobeResult({
      code: 'EMPTY_YOUTUBE',
      message:
        'YouTube returned no items for this search. Check API key restrictions (HTTP referrers / IP) in Google Cloud.',
    });
  }

  return emptyGlobeResult({
    code: 'FILTERED_OUT',
    message:
      'YouTube returned results but none passed music filters (shorts / lyric reuploads / instrumentals). Try again later.',
  });
}

module.exports = {
  getTopVideosForCountry,
  COUNTRY_GENRES,
};
