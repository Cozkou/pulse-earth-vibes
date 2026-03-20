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

async function getTopTracksForCountry(countryCode) {
  const token = await getAccessToken();

  const response = await axios.get(
    `https://api.spotify.com/v1/browse/featured-playlists?country=${countryCode}&limit=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const playlist = response.data.playlists?.items?.[0];
  if (!playlist) return null;

  const tracksResponse = await axios.get(
    `https://api.spotify.com/v1/playlists/${playlist.id}/tracks?limit=10`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const tracks = tracksResponse.data.items
    .filter(item => item.track)
    .map(item => ({
      id: item.track.id,
      name: item.track.name,
      artist: item.track.artists[0].name,
      preview_url: item.track.preview_url,
      spotify_url: item.track.external_urls.spotify,
    }));

  return tracks;
}

async function getAudioFeatures(trackIds) {
  const token = await getAccessToken();
  const response = await axios.get(
    `https://api.spotify.com/v1/audio-features?ids=${trackIds.join(',')}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data.audio_features;
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

module.exports = { getTopTracksForCountry, getAudioFeatures, createPlaylist };