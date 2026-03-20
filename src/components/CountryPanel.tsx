import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, Loader2, Send, Music } from 'lucide-react';
import { COUNTRY_NAME_TO_CODE, COUNTRY_META } from '@/data/countryData';

const API_BASE = 'http://localhost:4000';

interface ApiTrack {
  id: string;
  name: string;
  artist: string;
  preview_url: string | null;
  spotify_url: string;
}

interface ApiCountryData {
  country: string;
  code: string;
  tracks: ApiTrack[];
  energy: number;
  danceability: number;
  valence: number;
  updatedAt: string;
}

interface CountryPanelProps {
  countryName: string;
  onClose: () => void;
  isClosing: boolean;
}

function withAlpha(color: string, alpha: number): string {
  return color.replace('hsl(', 'hsla(').replace(')', `, ${alpha})`);
}

const CountryPanel = ({ countryName, onClose, isClosing }: CountryPanelProps) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiCountryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsg, setChatMsg] = useState('');
  const [chatReply, setChatReply] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const code = COUNTRY_NAME_TO_CODE[countryName];
  const meta = code ? COUNTRY_META[code] : undefined;
  const displayName = meta?.displayName || countryName;
  const flag = meta?.flag || '🌍';
  const vibe = meta?.vibe || 'Eclectic';
  const vibeColor = meta?.vibeColor || 'hsl(240, 10%, 50%)';

  useEffect(() => {
    if (!code) {
      setLoading(false);
      setError('No music data available for this country yet.');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setPlayingId(null);
    setChatOpen(false);
    setChatReply(null);

    fetch(`${API_BASE}/api/country/${code}`)
      .then(res => {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then(d => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError('No music data available for this country yet.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handlePlay = useCallback(
    (track: ApiTrack) => {
      if (!track.preview_url) return;

      if (playingId === track.id) {
        audioRef.current?.pause();
        setPlayingId(null);
        return;
      }

      if (audioRef.current) audioRef.current.pause();

      const audio = new Audio(track.preview_url);
      audio.play();
      audio.onended = () => setPlayingId(null);
      audioRef.current = audio;
      setPlayingId(track.id);
    },
    [playingId],
  );

  const handleCreatePlaylist = async () => {
    if (!code) return;
    setCreatingPlaylist(true);
    try {
      const res = await fetch(`${API_BASE}/api/create-playlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryCode: code }),
      });
      const json = await res.json();
      if (json.url) window.open(json.url, '_blank');
    } catch (_e) {
      // network error — ignore
    } finally {
      setCreatingPlaylist(false);
    }
  };

  const handleChat = async () => {
    if (!chatMsg.trim() || !code) return;
    const msg = chatMsg;
    setChatMsg('');
    setChatLoading(true);
    setChatReply(null);
    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, countryCode: code }),
      });
      const json = await res.json();
      setChatReply(json.reply);
      if (json.url) window.open(json.url, '_blank');
    } catch (_e) {
      setChatReply('Something went wrong, try again.');
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div
      className={`fixed top-0 right-0 z-40 h-full w-full max-w-[400px] flex ${
        isClosing ? 'slide-out-right' : 'slide-in-right'
      }`}
    >
      {/* Close bar */}
      <button
        onClick={onClose}
        className="h-full w-8 flex items-center justify-center shrink-0 bg-white/[0.03] hover:bg-white/[0.08] border-r border-white/[0.06] transition-colors active:scale-[0.97] group cursor-pointer"
        aria-label="Close panel"
      >
        <X size={14} className="text-muted-foreground/60 group-hover:text-foreground transition-colors" />
      </button>

      {/* Panel */}
      <div className="flex-1 h-full panel-blur border-l border-border/30 flex flex-col overflow-hidden">
        {/* Energy bar at top */}
        {data && (
          <div className="h-1 w-full shrink-0 overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div
              className="h-full transition-all duration-1000 ease-out"
              style={{
                width: `${Math.round(data.energy * 100)}%`,
                background: `linear-gradient(90deg, ${vibeColor}, ${withAlpha(vibeColor, 0.4)})`,
                boxShadow: `0 0 12px ${withAlpha(vibeColor, 0.6)}`,
              }}
            />
          </div>
        )}

        <div className="flex flex-col gap-6 p-6 pt-12 overflow-y-auto flex-1">
          {/* Header */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-4xl">{flag}</span>
              <h2 className="text-2xl font-bold text-foreground tracking-tight">{displayName}</h2>
            </div>
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                backgroundColor: withAlpha(vibeColor, 0.13),
                color: vibeColor,
                border: `1px solid ${withAlpha(vibeColor, 0.25)}`,
              }}
            >
              {vibe}
            </span>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="flex-1 flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          )}

          {/* Error / no data */}
          {error && !loading && (
            <div className="flex-1 flex flex-col items-center justify-center py-12 gap-3">
              <Music className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground text-center">{error}</p>
            </div>
          )}

          {/* Data content */}
          {data && !loading && (
            <>
              {/* Track list */}
              <div className="flex flex-col gap-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Top Tracks
                </h3>
                {data.tracks.slice(0, 5).map((track, i) => {
                  const isPlaying = playingId === track.id;
                  return (
                    <div
                      key={track.id}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors group ${
                        isPlaying ? 'bg-white/[0.06]' : 'hover:bg-muted/30'
                      }`}
                    >
                      <span className="text-xs text-muted-foreground/50 tabular-nums w-4 text-right shrink-0">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{track.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                      </div>
                      {isPlaying && <SoundWave color={vibeColor} />}
                      {track.preview_url ? (
                        <button
                          onClick={() => handlePlay(track)}
                          className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.12] transition-colors shrink-0 cursor-pointer"
                        >
                          {isPlaying ? (
                            <Pause size={12} className="text-foreground" />
                          ) : (
                            <Play size={12} className="text-foreground ml-0.5" />
                          )}
                        </button>
                      ) : (
                        <span className="w-7 h-7 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Mood */}
              <div className="flex flex-col gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mood</h3>
                <MoodBar label="Energy" value={Math.round(data.energy * 100)} color="var(--energy)" />
                <MoodBar label="Danceability" value={Math.round(data.danceability * 100)} color="var(--danceability)" />
                <MoodBar label="Valence" value={Math.round(data.valence * 100)} color="var(--valence)" />
              </div>
            </>
          )}
        </div>

        {/* Action buttons */}
        {data && !loading && (
          <div className="p-6 pt-0 flex flex-col gap-2">
            <button
              onClick={handleCreatePlaylist}
              disabled={creatingPlaylist}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
              style={{
                backgroundColor: 'hsla(var(--spotify-green) / 0.15)',
                color: 'hsl(var(--spotify-green))',
                border: '1px solid hsla(var(--spotify-green) / 0.2)',
              }}
            >
              {creatingPlaylist ? <Loader2 size={14} className="animate-spin" /> : '🎵'}
              {creatingPlaylist ? 'Creating…' : 'Create Playlist'}
            </button>

            <button
              onClick={() => setChatOpen(prev => !prev)}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-colors cursor-pointer"
              style={{
                backgroundColor: 'hsla(var(--primary) / 0.12)',
                color: 'hsl(var(--primary))',
                border: '1px solid hsla(var(--primary) / 0.2)',
              }}
            >
              💬 Ask Pulse Bot
            </button>

            {chatOpen && (
              <div className="mt-1 rounded-xl overflow-hidden border border-white/[0.06] bg-white/[0.03]">
                <div className="flex items-center gap-2 p-3">
                  <input
                    type="text"
                    value={chatMsg}
                    onChange={e => setChatMsg(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleChat()}
                    placeholder="e.g. make me a late night playlist…"
                    className="flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground/40 outline-none"
                    disabled={chatLoading}
                  />
                  <button
                    onClick={handleChat}
                    disabled={chatLoading || !chatMsg.trim()}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition-colors shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {chatLoading ? (
                      <Loader2 size={12} className="animate-spin text-muted-foreground" />
                    ) : (
                      <Send size={12} className="text-muted-foreground" />
                    )}
                  </button>
                </div>
                {chatReply && (
                  <div className="px-3 pb-3">
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{chatReply}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function SoundWave({ color }: { color: string }) {
  return (
    <div className="soundwave" style={{ color }}>
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function MoodBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{value}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${value}%`,
            backgroundColor: `hsl(${color})`,
          }}
        />
      </div>
    </div>
  );
}

export default CountryPanel;
