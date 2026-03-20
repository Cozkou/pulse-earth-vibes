const axios = require('axios');

let accessToken = null;
let tokenExpiry = null;

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

async function getTopTracksForCountry(countryCode) {
  const genre = COUNTRY_GENRES[countryCode];
  if (!genre) return null;

  const token = await getAccessToken();

  const url = `https://api.spotify.com/v1/search?q=genre:${encodeURIComponent(genre)}&type=track&market=${countryCode}&limit=10`;
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const tracks = (response.data.tracks?.items || [])
    .filter(item => item)
    .map(item => ({
      id: item.id,
      name: item.name,
      artist: item.artists[0].name,
      preview_url: item.preview_url,
      spotify_url: item.external_urls.spotify,
    }));

  return tracks;
}

async function createPlaylist(name, description, trackUris) {
  const token = await getAccessToken();

  const userResponse = await axios.get('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const userId = userResponse.data.id;

  const playlistResponse = await axios.post(
    `https://api.spotify.com/v1/users/${userId}/playlists`,
    { name, description, public: true },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const playlistId = playlistResponse.data.id;

  await axios.post(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
    { uris: trackUris },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return playlistResponse.data.external_urls.spotify;
}

module.exports = { getTopTracksForCountry, createPlaylist, COUNTRY_GENRES };