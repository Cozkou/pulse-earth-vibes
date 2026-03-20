# Pulse Earth Vibes

Globe UI + Node server that loads **Spotify** top tracks per country and can create playlists.

## Luffa bot (polling)

Luffa uses **polling**, not webhooks. The server polls `https://apibot.luffa.im/robot/receive` every second and replies via `robot/send` (DM) or `robot/sendGroup` (group).

**Setup:** Set `LUFFA_BOT_SECRET` in `server/.env` (your Robot Key from the Luffa dashboard). No webhook URL or ngrok needed.

**Run:** `cd server && node index.js`. You should see `Luffa: polling started`. Message your bot in the Luffa app.

Supported intents (country must be in the message):

- Create a playlist from that country's trending tracks (Spotify URL in reply)
- Ask what's trending
- Ask for the "vibe" (energy / danceability / valence)
