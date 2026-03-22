const axios = require('axios');

/**
 * If true, the same request may succeed with another project key (quota, auth, rate limit).
 * Used only inside youtubeSearchWithFallback — all site YouTube *search* traffic goes through that helper.
 */
function shouldTryNextApiKey(err) {
  const status = err.response?.status;
  const code = err.response?.data?.error?.code;
  if (status === 403 || status === 401 || code === 403 || code === 401) return true;
  if (status === 429) return true;
  // Rare: some limit errors use 400; still worth trying another GCP project’s key.
  if (status === 400 && isYoutubeQuotaExceededError(err)) return true;
  return false;
}

/**
 * True when the response indicates quota / usage limits (not “bad query”).
 * Google uses several shapes: reason `quotaExceeded`, `dailyLimitExceeded`, domain `youtube.quota` or `usageLimits`.
 */
function isYoutubeQuotaExceededError(err) {
  if (!err?.response?.data?.error) return false;
  const top = err.response.data.error;
  const errors = top.errors;
  if (Array.isArray(errors)) {
    for (const e of errors) {
      const reason = String(e?.reason || '').toLowerCase();
      const domain = String(e?.domain || '').toLowerCase();
      if (
        reason === 'quotaexceeded' ||
        reason === 'dailylimitexceeded' ||
        reason === 'ratelimitexceeded' ||
        reason === 'userratelimitexceeded'
      ) {
        return true;
      }
      if (reason.includes('quota') || reason.includes('limit')) return true;
      if (domain === 'youtube.quota' || domain === 'usagelimits' || domain.includes('quota')) return true;
    }
  }
  const msg = String(top.message || '').toLowerCase();
  if (msg.includes('daily limit') || msg.includes('dailylimit')) return true;
  if (msg.includes('quota') && (msg.includes('exceed') || msg.includes('exceeded'))) return true;
  return false;
}

function formatYoutubeApiError(err) {
  const msg = err.response?.data?.error?.message;
  if (typeof msg === 'string') return msg.replace(/<[^>]+>/g, '').trim();
  return err.message || String(err);
}

function getYoutubeApiKeys() {
  const raw = [
    process.env.YOUTUBE_API_KEY,
    process.env.YOUTUBE_API_KEY_2,
    process.env.YOUTUBE_API_KEY_3,
  ].filter(Boolean);
  // Same key repeated in _2/_3 doesn’t add quota (quota is per GCP project); dedupe avoids useless retries.
  return [...new Set(raw)];
}

/**
 * @param {string} query
 * @param {string} key
 * @param {number} [maxResults]
 * @param {string|null} [regionCode] ISO 3166-1 alpha-2 for globe bias
 * @param {{ videoCategoryId?: string | null }} [opts] Pass `{ videoCategoryId: null }` to omit category (broader search; used for Crystal when Music-only returns nothing).
 */
async function youtubeSearch(query, key, maxResults = 20, regionCode = null, opts = {}) {
  const params = {
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults,
    key,
  };
  if (regionCode) params.regionCode = regionCode;
  if (Object.prototype.hasOwnProperty.call(opts, 'videoCategoryId')) {
    if (opts.videoCategoryId != null && opts.videoCategoryId !== '') {
      params.videoCategoryId = opts.videoCategoryId;
    }
  } else {
    params.videoCategoryId = '10';
  }
  const { data } = await axios.get('https://www.googleapis.com/youtube/v3/search', { params });
  return data;
}

async function youtubeSearchWithFallback(query, maxResults = 20, regionCode = null, opts = {}) {
  const keys = getYoutubeApiKeys();
  if (keys.length === 0) return null;
  let lastErr;
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    try {
      return await youtubeSearch(query, key, maxResults, regionCode, opts);
    } catch (err) {
      lastErr = err;
      const tryNext = shouldTryNextApiKey(err) && i < keys.length - 1;
      if (tryNext) {
        if (isYoutubeQuotaExceededError(err)) {
          console.warn(
            `[YouTube API] Quota exceeded on key ${i + 1}/${keys.length}; trying next key.`,
            formatYoutubeApiError(err).slice(0, 120),
          );
        } else {
          console.warn(
            `[YouTube API] Search failed on key ${i + 1}/${keys.length} (HTTP ${err.response?.status || '?'}); trying next key.`,
            formatYoutubeApiError(err).slice(0, 120),
          );
        }
      }
      if (tryNext) continue;
      if (isYoutubeQuotaExceededError(err)) {
        const e = new Error(
          'YouTube Data API quota/usage limit hit on every distinct key we tried. Keys from the same Google Cloud project share one daily quota — use API keys from different projects for YOUTUBE_API_KEY, _2, and _3. Otherwise wait for reset (Pacific midnight) or raise quota in Google Cloud Console.',
        );
        e.code = 'YOUTUBE_QUOTA_EXCEEDED';
        e.cause = err;
        throw e;
      }
      throw err;
    }
  }
  throw lastErr;
}

module.exports = {
  shouldTryNextApiKey,
  /** @deprecated use shouldTryNextApiKey */
  isKeyError: shouldTryNextApiKey,
  isYoutubeQuotaExceededError,
  formatYoutubeApiError,
  getYoutubeApiKeys,
  youtubeSearch,
  youtubeSearchWithFallback,
};
