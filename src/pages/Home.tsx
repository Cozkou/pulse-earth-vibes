import { useNavigate } from 'react-router-dom';

const Home = () => {
  const navigate = useNavigate();

  return (
    <main className="relative h-screen w-full overflow-hidden bg-background text-foreground">
      <div
        className="absolute inset-0 opacity-45 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 18% 24%, rgba(0,255,240,0.16), transparent 38%), radial-gradient(circle at 82% 68%, rgba(255,0,170,0.18), transparent 40%), radial-gradient(circle at 50% 60%, rgba(74, 111, 255, 0.22), transparent 45%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          backgroundImage:
            'radial-gradient(2px 2px at 12% 18%, rgba(255,255,255,0.9), transparent), radial-gradient(1.5px 1.5px at 33% 42%, rgba(174,220,255,0.8), transparent), radial-gradient(2px 2px at 71% 28%, rgba(255,207,245,0.85), transparent), radial-gradient(1.5px 1.5px at 83% 54%, rgba(185,255,249,0.7), transparent), radial-gradient(2px 2px at 64% 78%, rgba(255,255,255,0.75), transparent), radial-gradient(1.5px 1.5px at 23% 72%, rgba(173,206,255,0.75), transparent), radial-gradient(1.5px 1.5px at 44% 82%, rgba(255,212,248,0.7), transparent), radial-gradient(2px 2px at 90% 16%, rgba(255,255,255,0.8), transparent)',
        }}
      />
      <div
        className="waveform-layer absolute inset-x-0 bottom-[20%] h-[22vh] pointer-events-none opacity-45"
        style={{
          backgroundImage:
            'radial-gradient(30px 120px at 15px 100%, rgba(0, 255, 245, 0.5), transparent 65%), radial-gradient(34px 140px at 65px 100%, rgba(0, 255, 245, 0.25), transparent 70%), radial-gradient(26px 100px at 112px 100%, rgba(0, 255, 245, 0.4), transparent 66%), radial-gradient(28px 120px at 164px 100%, rgba(0, 255, 245, 0.32), transparent 68%), radial-gradient(32px 145px at 214px 100%, rgba(0, 255, 245, 0.44), transparent 70%)',
        }}
      />
      <div
        className="waveform-layer slow absolute inset-x-0 bottom-[12%] h-[20vh] pointer-events-none opacity-35"
        style={{
          backgroundImage:
            'radial-gradient(30px 120px at 25px 100%, rgba(255, 0, 170, 0.45), transparent 64%), radial-gradient(34px 140px at 76px 100%, rgba(255, 0, 170, 0.28), transparent 69%), radial-gradient(26px 95px at 126px 100%, rgba(255, 0, 170, 0.4), transparent 64%), radial-gradient(28px 122px at 174px 100%, rgba(255, 0, 170, 0.28), transparent 68%), radial-gradient(30px 130px at 226px 100%, rgba(255, 0, 170, 0.38), transparent 68%)',
        }}
      />
      <div
        className="equalizer-grid absolute inset-x-0 bottom-0 h-[22vh] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to top, rgba(0, 255, 245, 0.35), rgba(0, 255, 245, 0.02) 60%, transparent), repeating-linear-gradient(to right, rgba(255, 255, 255, 0.06) 0 2px, transparent 2px 20px)',
        }}
      />

      <section className="relative z-10 mx-auto flex h-screen max-w-6xl flex-col items-center justify-start px-6 pt-24 text-center">
        <h1 className="retro-title glow-text text-4xl md:text-6xl">GlobeMeta</h1>
        <p className="retro-body mt-8 max-w-3xl text-muted-foreground">
          A live world map of what people are listening to. Jump country to country, hear previews, and generate playlists from local trends.
        </p>
        <div className="mt-10 flex items-center gap-3">
          <button
            onClick={() => navigate('/globe')}
            className="retro-title retro-panel rounded-sm px-8 py-4 text-xs text-foreground transition-transform hover:-translate-y-0.5"
            style={{
              background: 'linear-gradient(90deg, rgba(0,255,245,0.15), rgba(255,0,153,0.15))',
            }}
          >
            Start Exploring
          </button>
        </div>

      </section>
    </main>
  );
};

export default Home;
