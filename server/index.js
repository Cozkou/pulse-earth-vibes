require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const { getTopTracksForCountry, createPlaylist, COUNTRY_GENRES } = require('./spotify');
const { parseUserIntent, generatePlaylistDetails } = require('./agent');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// In-memory data store
let globeData = {};

// Countries to track
const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'BR', name: 'Brazil' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'KR', name: 'South Korea' },
  { code: 'JP', name: 'Japan' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'MX', name: 'Mexico' },
  { code: 'IN', name: 'India' },
  { code: 'AR', name: 'Argentina' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'AU', name: 'Australia' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
];

const GENRE_MOOD = {
  'hip-hop':    { energy: 0.80, danceability: 0.75, valence: 0.60 },
  'latin':      { energy: 0.85, danceability: 0.90, valence: 0.80 },
  'afrobeats':  { energy: 0.82, danceability: 0.88, valence: 0.78 },
  'k-pop':      { energy: 0.78, danceability: 0.80, valence: 0.72 },
  'j-pop':      { energy: 0.65, danceability: 0.70, valence: 0.68 },
  'electronic': { energy: 0.88, danceability: 0.85, valence: 0.65 },
  'pop':        { energy: 0.70, danceability: 0.72, valence: 0.65 },
  'bollywood':  { energy: 0.75, danceability: 0.82, valence: 0.76 },
};

async function refreshCountryData(country) {
  try {
    const tracks = await getTopTracksForCountry(country.code);
    if (!tracks || tracks.length === 0) return;

    const genre = COUNTRY_GENRES[country.code] || 'pop';
    const mood = GENRE_MOOD[genre] || GENRE_MOOD['pop'];

    globeData[country.code] = {
      country: country.name,
      code: country.code,
      tracks,
      energy: mood.energy,
      danceability: mood.danceability,
      valence: mood.valence,
      updatedAt: new Date().toISOString(),
    };

    console.log(`Updated data for ${country.name}`);
  } catch (err) {
    console.error(`Failed to update ${country.name}:`, err.message);
  }
}

async function refreshAllData() {
  console.log('Refreshing globe data...');
  for (const country of COUNTRIES) {
    await refreshCountryData(country);
    await new Promise(r => setTimeout(r, 500)); // avoid rate limits
  }
  console.log('Globe data refresh complete');
}

// API endpoint for the globe frontend
app.get('/api/globe-data', (req, res) => {
  res.json(globeData);
});

app.get('/api/country/:code', (req, res) => {
  const data = globeData[req.params.code.toUpperCase()];
  if (!data) return res.status(404).json({ error: 'Country not found' });
  res.json(data);
});

app.post('/api/create-playlist', async (req, res) => {
  try {
    const { countryCode } = req.body;
    const countryData = globeData[countryCode?.toUpperCase()];
    if (!countryData) return res.status(404).json({ error: 'No data for this country' });

    const details = await generatePlaylistDetails(countryData.country, countryData.tracks);
    const trackUris = countryData.tracks.map(t => `spotify:track:${t.id}`);
    const url = await createPlaylist(details.name, details.description, trackUris);

    res.json({ url, name: details.name });
  } catch (err) {
    console.error('Create playlist error:', err.message);
    res.status(500).json({ error: 'Failed to create playlist' });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, countryCode } = req.body;
    if (!message) return res.status(400).json({ error: 'No message' });

    const intent = await parseUserIntent(message);
    const code = intent.countryCode || countryCode?.toUpperCase();

    if (intent.intent === 'create_playlist' && code) {
      const cd = globeData[code];
      if (!cd) return res.json({ reply: "I don't have data for that country yet." });

      const details = await generatePlaylistDetails(cd.country, cd.tracks);
      const trackUris = cd.tracks.map(t => `spotify:track:${t.id}`);
      const url = await createPlaylist(details.name, details.description, trackUris);

      return res.json({ reply: `${details.message}\n\n🎵 ${details.name}`, url });
    }

    if (intent.intent === 'get_trending' && code) {
      const cd = globeData[code];
      if (!cd) return res.json({ reply: 'No data yet for this country.' });

      const top3 = cd.tracks.slice(0, 3).map((t, i) => `${i + 1}. ${t.name} — ${t.artist}`).join('\n');
      return res.json({ reply: `🔥 Trending:\n${top3}` });
    }

    if (intent.intent === 'get_vibe' && code) {
      const cd = globeData[code];
      if (!cd) return res.json({ reply: 'No data yet for this country.' });

      return res.json({
        reply: `The vibe right now: Energy ${Math.round(cd.energy * 100)}% · Dance ${Math.round(cd.danceability * 100)}% · Valence ${Math.round(cd.valence * 100)}%`,
      });
    }

    return res.json({
      reply: 'Try asking me:\n• "Make me a playlist from here"\n• "What\'s trending?"\n• "What\'s the vibe?"',
    });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ reply: 'Something went wrong, try again.' });
  }
});

// Luffa webhook
app.post('/webhook/luffa', async (req, res) => {
  res.sendStatus(200); // always respond immediately

  const { message, userId, groupId } = req.body;
  if (!message) return;

  try {
    const intent = await parseUserIntent(message);
    console.log('Intent:', intent);

    if (intent.intent === 'create_playlist' && intent.countryCode) {
      const countryData = globeData[intent.countryCode];
      
      if (!countryData) {
        await sendLuffaMessage(userId || groupId, `I don't have data for ${intent.country} yet, try again in a moment!`);
        return;
      }

      const details = await generatePlaylistDetails(intent.country, countryData.tracks);
      const trackUris = countryData.tracks.map(t => `spotify:track:${t.id}`);
      const playlistUrl = await createPlaylist(details.name, details.description, trackUris);

      await sendLuffaMessage(userId || groupId, `${details.message}\n\n🎵 ${details.name}\n${playlistUrl}`);

    } else if (intent.intent === 'get_trending' && intent.countryCode) {
      const countryData = globeData[intent.countryCode];
      if (!countryData) {
        await sendLuffaMessage(userId || groupId, `No data yet for ${intent.country}!`);
        return;
      }
      const top3 = countryData.tracks.slice(0, 3).map((t, i) => `${i + 1}. ${t.name} — ${t.artist}`).join('\n');
      await sendLuffaMessage(userId || groupId, `🔥 Trending in ${intent.country}:\n${top3}\n\nView the full globe: https://globe-meta.vercel.app`);

    } else {
      await sendLuffaMessage(userId || groupId, `Try asking me:\n• "Make me a playlist from Brazil"\n• "What's trending in Japan?"\n• "What's the vibe in Nigeria?"`);
    }
  } catch (err) {
    console.error('Webhook error:', err.message);
  }
});

async function sendLuffaMessage(recipientId, text) {
  try {
    await axios.post('https://api.luffa.im/bot/send', {
      botUid: process.env.LUFFA_BOT_UID,
      secretKey: process.env.LUFFA_BOT_SECRET,
      recipientId,
      message: text,
    });
  } catch (err) {
    console.error('Luffa send error:', err.message);
  }
}

// Refresh data every hour
cron.schedule('0 * * * *', refreshAllData);

const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await refreshAllData(); // load data on startup
});