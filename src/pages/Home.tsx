import { useNavigate } from 'react-router-dom';

const Home = () => {
  const navigate = useNavigate();

  return (
    <main className="relative h-screen w-full overflow-hidden bg-background text-foreground">
      <section className="relative z-10 mx-auto flex h-screen max-w-6xl flex-col items-center justify-start px-6 pt-24 text-center">
        <h1 className="retro-title glow-text text-4xl md:text-6xl">Pulse Earth Vibes</h1>
        <p className="retro-body mt-8 max-w-3xl text-muted-foreground">
          A live world map of what people are listening to. Jump country to country, hear previews, and generate playlists from local trends.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
          <button
            onClick={() => navigate('/globe')}
            className="retro-title retro-panel rounded-sm px-8 py-4 text-xs text-foreground transition-transform hover:-translate-y-0.5"
            style={{
              background: 'linear-gradient(90deg, rgba(0,255,245,0.15), rgba(255,0,153,0.15))',
            }}
          >
            Begin
          </button>
          <button
            type="button"
            onClick={() => navigate('/crystal')}
            className="retro-body text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Crystal Ball — camera &amp; mood music
          </button>
        </div>

      </section>
    </main>
  );
};

export default Home;
