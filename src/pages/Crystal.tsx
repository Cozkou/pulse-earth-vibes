import { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import * as faceapi from '@vladmandic/face-api';
import { useNavigate } from 'react-router-dom';
import { Video, VideoOff, Loader2, Music } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';
const GLOBE_BG = '#0a0a0f';
const TRANSITION_DURATION_MS = 4000;
const HAPPINESS_DEBOUNCE_MS = 3000;
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

type YouTubeVideo = { source: 'youtube'; videoId: string; title: string };

function happinessFromExpressions(expressions: Record<string, number>): number {
  if (!expressions) return 0.5;
  const happy = expressions.happy ?? 0;
  const sad = expressions.sad ?? 0;
  return Math.max(0, Math.min(1, happy - sad * 0.5 + 0.5));
}

function isSmiling(expressions: Record<string, number>): boolean {
  if (!expressions) return false;
  const happy = expressions.happy ?? 0;
  return happy > 0.5;
}

const YT_ERROR_CODES = new Set([2, 5, 100, 101, 150]);

function YouTubePlayer({ videoId, onError }: { videoId: string; onError: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<{ destroy: () => void } | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!videoId || !containerRef.current) return;
    let cancelled = false;
    (window as unknown as { ytReady?: Promise<void> }).ytReady?.then(() => {
      if (cancelled || !containerRef.current) return;
      const YT = (window as unknown as { YT?: { Player: new (el: HTMLElement, opts: { videoId: string; playerVars: object; events: { onError: (e: { data: number }) => void } }) => { destroy: () => void } } }).YT;
      if (!YT?.Player) return;
      containerRef.current.innerHTML = '';
      const player = new YT.Player(containerRef.current, {
        videoId,
        playerVars: { autoplay: 1, start: 90 },
        events: {
          onError: (e: { data: number }) => {
            if (YT_ERROR_CODES.has(e.data)) onErrorRef.current();
          },
        },
      });
      playerRef.current = player;
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [videoId]);

  return <div ref={containerRef} className="w-full aspect-video bg-black" />;
}

const Crystal = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<{ frameId: number } | null>(null);
  const lastHappinessRef = useRef(0.5);
  const lastMusicRef = useRef(0);
  const youtubeQueueRef = useRef<YouTubeVideo[]>([]);

  const [cameraOn, setCameraOn] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [happiness, setHappiness] = useState(0.5);
  const [currentItem, setCurrentItem] = useState<YouTubeVideo | null>(null);
  const [sessionItems, setSessionItems] = useState<YouTubeVideo[]>([]);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchYouTubeByHappiness = useCallback(async (h: number): Promise<YouTubeVideo[]> => {
    try {
      const res = await fetch(`${API_BASE}/api/youtube-by-happiness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ happiness: h }),
      });
      if (!res.ok) return [];
      const { videos } = await res.json();
      return (videos || []).map((v: { videoId: string; title: string }) => ({
        source: 'youtube' as const,
        videoId: v.videoId,
        title: v.title,
      }));
    } catch {
      return [];
    }
  }, []);

  const playMusicForHappiness = useCallback(
    async (h: number) => {
      setLoading(true);
      setError(null);
      try {
        const youtubeVideos = await fetchYouTubeByHappiness(h);
        if (youtubeVideos.length > 0) {
          youtubeQueueRef.current = youtubeVideos.slice(1);
          const first = youtubeVideos[0];
          setCurrentItem(first);
          setSessionItems((prev) => [...prev, first]);
        } else {
          setError('No music available. Add YOUTUBE_API_KEY to server/.env');
        }
      } catch (e) {
        setError('Could not fetch music.');
      } finally {
        setLoading(false);
      }
    },
    [fetchYouTubeByHappiness]
  );

  const detectFace = useCallback(async () => {
    const video = videoRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!video || !overlayCanvas || !modelsLoaded || video.paused || video.readyState < 2) {
      requestAnimationFrame(detectFace);
      return;
    }

    try {
      const result = await faceapi
        .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
        .withFaceLandmarks()
        .withFaceExpressions();

      const ctx = overlayCanvas.getContext('2d');
      if (ctx) {
        let displayWidth = video.offsetWidth;
        let displayHeight = video.offsetHeight;
        if (displayWidth <= 0 || displayHeight <= 0) {
          const parent = overlayCanvas.parentElement;
          if (parent) {
            displayWidth = parent.clientWidth;
            displayHeight = parent.clientHeight;
          }
        }
        if (displayWidth <= 0 || displayHeight <= 0) {
          requestAnimationFrame(detectFace);
          return;
        }
        if (overlayCanvas.width !== displayWidth || overlayCanvas.height !== displayHeight) {
          overlayCanvas.width = displayWidth;
          overlayCanvas.height = displayHeight;
        }
        ctx.clearRect(0, 0, displayWidth, displayHeight);

        if (!result) {
          ctx.font = '11px system-ui';
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.textAlign = 'center';
          ctx.fillText('Looking for face...', displayWidth / 2, displayHeight / 2);
        } else if (video.videoWidth > 0 && video.videoHeight > 0) {
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          const scale = Math.max(displayWidth / vw, displayHeight / vh);
          const cropX = (vw * scale - displayWidth) / 2;
          const cropY = (vh * scale - displayHeight) / 2;
          const toDisplay = (p: { x: number; y: number }) => ({
            x: p.x * scale - cropX,
            y: p.y * scale - cropY,
          });

          const box = result.detection.box;
          const b = toDisplay({ x: box.x, y: box.y });
          const bw = box.width * scale;
          const bh = box.height * scale;
          ctx.strokeStyle = 'rgba(0,255,245,0.9)';
          ctx.lineWidth = 2;
          ctx.strokeRect(b.x, b.y, bw, bh);

          const landmarks = result.landmarks as faceapi.FaceLandmarks68;
          const mouthIndices = new Set([48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67]);
          landmarks.positions.forEach((p, i) => {
            const d = toDisplay(p);
            ctx.beginPath();
            ctx.arc(d.x, d.y, mouthIndices.has(i) ? 5 : 3, 0, Math.PI * 2);
            ctx.fillStyle = mouthIndices.has(i) ? 'rgba(255,100,150,0.95)' : 'rgba(0,255,245,0.9)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = 1;
            ctx.stroke();
          });

          const mouth = landmarks.getMouth();
          ctx.strokeStyle = isSmiling(result.expressions) ? 'rgba(74,222,128,0.95)' : 'rgba(248,113,113,0.9)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          mouth.forEach((p, i) => {
            const d = toDisplay(p);
            if (i === 0) ctx.moveTo(d.x, d.y);
            else ctx.lineTo(d.x, d.y);
          });
          ctx.closePath();
          ctx.stroke();

          if (result.expressions) {
            const h = happinessFromExpressions(result.expressions);
            setHappiness(h);
            const now = Date.now();
            const diff = Math.abs(h - lastHappinessRef.current);
            if (diff > 0.15 && now - lastMusicRef.current > HAPPINESS_DEBOUNCE_MS) {
              lastHappinessRef.current = h;
              lastMusicRef.current = now;
              playMusicForHappiness(h);
            }
          }
        }
      }
    } catch (_) {
      /* ignore */
    }
    requestAnimationFrame(detectFace);
  }, [modelsLoaded, playMusicForHappiness]);

  useEffect(() => {
    (async () => {
      await faceapi.tf.setBackend('webgl');
      await faceapi.tf.ready();
      await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
      setModelsLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(new THREE.Color(GLOBE_BG), 1);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 0, 2.8);

    scene.add(new THREE.AmbientLight(0x6688bb, 1.2));
    const dir = new THREE.DirectionalLight(0x88aadd, 0.9);
    dir.position.set(5, 3, 5);
    scene.add(dir);

    const loader = new THREE.TextureLoader();
    const globeMat = new THREE.MeshPhongMaterial({
      map: null,
      color: 0x4488cc,
      emissive: 0x112244,
      shininess: 20,
      specular: 0x334466,
    });
    loader.load(
      'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
      (tex) => {
        globeMat.map = tex;
        globeMat.needsUpdate = true;
      },
      undefined,
      () => {}
    );

    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), globeMat);
    scene.add(globe);

    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: 0x88aaff,
      metalness: 0.05,
      roughness: 0.05,
      transmission: 0.95,
      thickness: 0.5,
      transparent: true,
      opacity: 0,
    });
    const crystal = new THREE.Mesh(new THREE.SphereGeometry(1.02, 64, 64), crystalMat);
    crystal.visible = false;
    scene.add(crystal);

    const state = { frameId: 0, transitionStart: performance.now() };
    sceneRef.current = state;

    const animate = () => {
      state.frameId = requestAnimationFrame(animate);
      const elapsed = performance.now() - state.transitionStart;
      const t = Math.min(elapsed / TRANSITION_DURATION_MS, 1);
      const ease = t * t * (3 - 2 * t);
      globe.scale.setScalar(1 - ease * 0.15);
      globeMat.opacity = 1 - ease;
      globeMat.transparent = ease > 0.01;
      if (ease > 0.02) {
        crystal.visible = true;
        crystalMat.opacity = ease * 0.85;
      }
      globe.rotation.y += 0.002;
      crystal.rotation.y += 0.001;
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(state.frameId);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    if (cameraOn && modelsLoaded) detectFace();
  }, [cameraOn, modelsLoaded, detectFace]);

  const toggleCamera = async () => {
    if (cameraOn) {
      const video = videoRef.current;
      if (video?.srcObject) {
        (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      }
      setCameraOn(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.onloadeddata = () => video.play();
      }
      setCameraOn(true);
      setError(null);
    } catch (e) {
      setError('Camera access denied.');
    }
  };

  const playSample = () => {
    setError(null);
    playMusicForHappiness(0.6);
  };

  const skipToNextYoutube = useCallback(async () => {
    const queue = youtubeQueueRef.current;
    if (queue.length > 0) {
      const next = queue.shift()!;
      youtubeQueueRef.current = [...queue];
      setCurrentItem(next);
      setSessionItems((prev) => [...prev, next]);
      return;
    }
    const h = lastHappinessRef.current;
    const videos = await fetchYouTubeByHappiness(h);
    if (videos.length > 0) {
      youtubeQueueRef.current = videos.slice(1);
      const first = videos[0];
      setCurrentItem(first);
      setSessionItems((prev) => [...prev, first]);
    } else {
      setCurrentItem(null);
    }
  }, [fetchYouTubeByHappiness]);

  const endSession = async () => {
    const video = videoRef.current;
    if (video?.srcObject) {
      (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
    setCameraOn(false);
    setSessionEnded(true);
  };

  const showEndModal = sessionEnded;
  const navigate = useNavigate();

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full" style={{ background: GLOBE_BG }}>
      <div
        className={`fixed top-16 right-4 z-[100] w-48 h-48 rounded-lg border-2 border-white/20 shadow-xl overflow-hidden transition-opacity ${
          cameraOn ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover rounded-lg" />
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full rounded-lg pointer-events-none"
          style={{ zIndex: 10 }}
        />
      </div>

      {currentItem?.source === 'youtube' && (
        <div className="fixed bottom-40 left-1/2 -translate-x-1/2 z-40 w-[min(90vw,320px)] rounded-lg overflow-hidden border border-white/10 transition-opacity duration-300">
          <YouTubePlayer videoId={currentItem.videoId} onError={skipToNextYoutube} />
        </div>
      )}

      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4">
        <button
          onClick={() => navigate('/')}
          className="retro-title text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back
        </button>
        <h1 className="retro-title text-sm font-semibold glow-text">Crystal Ball</h1>
        <div className="w-[60px]" />
      </header>

      <div className="fixed bottom-0 left-0 right-0 z-50 p-6 pb-10">
        <div
          className="retro-panel mx-auto max-w-md p-4 rounded-lg"
          style={{
            background: 'rgba(8,12,28,0.9)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(0,255,245,0.2)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="retro-title text-[10px] text-muted-foreground">Happiness</span>
            <span className="retro-title text-[10px] tabular-nums" style={{ color: happiness > 0.6 ? '#4ade80' : happiness < 0.4 ? '#f87171' : '#94a3b8' }}>
              {Math.round(happiness * 100)}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden mb-3">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${happiness * 100}%`,
                background: happiness > 0.6 ? 'linear-gradient(90deg,#22c55e,#4ade80)' : happiness < 0.4 ? 'linear-gradient(90deg,#dc2626,#f87171)' : 'linear-gradient(90deg,#64748b,#94a3b8)',
              }}
            />
          </div>

          {error && <p className="retro-body text-xs text-red-400 mb-2">{error}</p>}
          {currentItem && (
            <p className="retro-body text-xs text-foreground mb-2 truncate">
              🎵 {currentItem.title}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleCamera}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-sm retro-title text-xs transition-all ${
                  cameraOn ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-accent/20 text-accent border border-accent/40'
                }`}
              >
                {cameraOn ? <VideoOff size={14} /> : <Video size={14} />}
                {cameraOn ? 'Stop camera' : 'Start camera'}
              </button>
              <button
                onClick={playSample}
                disabled={loading || !modelsLoaded}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-sm retro-title text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 disabled:opacity-50"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Music size={14} />}
                Play sample
              </button>
            </div>
            <button
              onClick={endSession}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-sm retro-title text-xs bg-white/10 hover:bg-white/15 border border-white/20"
            >
              <Music size={14} />
              End & save
            </button>
          </div>
        </div>
      </div>

      <p className="fixed bottom-24 left-0 right-0 text-center retro-body text-[10px] text-muted-foreground/70 px-4">
        YouTube · Music matches your face
      </p>

      {showEndModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.85)' }}
        >
          <div className="retro-panel p-6 max-w-sm text-center max-h-[80vh] overflow-y-auto" style={{ border: '1px solid rgba(0,255,245,0.3)' }}>
            <p className="retro-title text-sm mb-2">{sessionItems.length > 0 ? 'Session saved' : 'Session ended'}</p>
            <p className="retro-body text-xs text-muted-foreground mb-4">
              {sessionItems.length > 0 ? `${sessionItems.length} videos discovered` : 'No videos to save'}
            </p>
            {sessionItems.length > 0 && (
              <div className="space-y-2 text-left mb-4 max-h-48 overflow-y-auto">
                {sessionItems.map((v, i) => (
                  <a
                    key={i}
                    href={`https://www.youtube.com/watch?v=${v.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block retro-body text-xs text-accent truncate hover:underline"
                  >
                    {i + 1}. {v.title}
                  </a>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                setSessionItems([]);
                setCurrentItem(null);
                setSessionEnded(false);
              }}
              className="block w-full mt-4 retro-body text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Crystal;
