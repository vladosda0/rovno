import { useState } from "react";

const ColorSwatch = ({ name, variable, className }: { name: string; variable: string; className?: string }) => (
  <div className="flex flex-col items-center gap-2">
    <div
      className={`w-16 h-16 rounded-card border border-border ${className ?? ""}`}
      style={{ backgroundColor: `hsl(var(--${variable}))` }}
    />
    <span className="text-caption text-muted-foreground text-center">{name}</span>
    <span className="text-[10px] text-muted-foreground/60 font-mono">--{variable}</span>
  </div>
);

const ThemeDemo = () => {
  const [isDark, setIsDark] = useState(false);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle("dark");
  };

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
      {/* Header */}
      <header className="sticky top-0 z-10 glass px-sp-4 py-sp-2">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-h3">StroyAgent Design System</h1>
          <button
            onClick={toggleTheme}
            className="px-sp-2 py-sp-1 rounded-pill glass text-body-sm font-medium hover:scale-[1.02] transition-transform duration-150"
          >
            {isDark ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-sp-4 py-sp-6 space-y-sp-6">
        {/* === Colors === */}
        <section>
          <h2 className="text-h2 mb-sp-3">Color System</h2>

          <div className="space-y-sp-4">
            <div>
              <h3 className="text-h3 mb-sp-2 text-muted-foreground">Base</h3>
              <div className="flex flex-wrap gap-sp-3">
                <ColorSwatch name="Background" variable="background" />
                <ColorSwatch name="Foreground" variable="foreground" />
                <ColorSwatch name="Card" variable="card" />
                <ColorSwatch name="Primary" variable="primary" />
                <ColorSwatch name="Secondary" variable="secondary" />
                <ColorSwatch name="Muted" variable="muted" />
                <ColorSwatch name="Border" variable="border" />
              </div>
            </div>

            <div>
              <h3 className="text-h3 mb-sp-2 text-muted-foreground">Semantic</h3>
              <div className="flex flex-wrap gap-sp-3">
                <ColorSwatch name="Accent" variable="accent" />
                <ColorSwatch name="Success" variable="success" />
                <ColorSwatch name="Warning" variable="warning" />
                <ColorSwatch name="Destructive" variable="destructive" />
                <ColorSwatch name="Info" variable="info" />
              </div>
            </div>
          </div>
        </section>

        {/* === Typography === */}
        <section>
          <h2 className="text-h2 mb-sp-3">Typography Scale</h2>
          <div className="space-y-sp-2 glass rounded-panel p-sp-4">
            <p className="text-h1">H1 — 52px Bold</p>
            <p className="text-h2">H2 — 30px Semibold</p>
            <p className="text-h3">H3 — 22px Semibold</p>
            <p className="text-body">Body — 15px Regular — The quick brown fox jumps over the lazy dog.</p>
            <p className="text-body-sm text-muted-foreground">Body Small — 13px — Secondary information and helper text.</p>
            <p className="text-caption text-muted-foreground">Caption — 12px Medium — Labels, timestamps, metadata.</p>
          </div>
        </section>

        {/* === Spacing === */}
        <section>
          <h2 className="text-h2 mb-sp-3">Spacing (8pt Grid)</h2>
          <div className="flex items-end gap-sp-2">
            {[
              { label: "8px", size: "sp-1" },
              { label: "16px", size: "sp-2" },
              { label: "24px", size: "sp-3" },
              { label: "32px", size: "sp-4" },
              { label: "48px", size: "sp-6" },
            ].map(({ label, size }) => (
              <div key={size} className="flex flex-col items-center gap-1">
                <div
                  className="bg-accent rounded-sm"
                  style={{ width: `var(--space-${size.split("-")[1]})`, height: `var(--space-${size.split("-")[1]})` }}
                />
                <span className="text-caption text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* === Radii === */}
        <section>
          <h2 className="text-h2 mb-sp-3">Border Radii</h2>
          <div className="flex flex-wrap gap-sp-3">
            {[
              { label: "Card — 16px", cls: "rounded-card" },
              { label: "Panel — 20px", cls: "rounded-panel" },
              { label: "Modal — 24px", cls: "rounded-modal" },
              { label: "Pill — 999px", cls: "rounded-pill" },
            ].map(({ label, cls }) => (
              <div key={cls} className="flex flex-col items-center gap-2">
                <div className={`w-24 h-16 border-2 border-accent ${cls}`} />
                <span className="text-caption text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* === Glass Surfaces === */}
        <section>
          <h2 className="text-h2 mb-sp-3">Glass Surfaces</h2>
          <div className="relative">
            {/* Background pattern to show glass effect */}
            <div className="absolute inset-0 rounded-panel overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-info/10 to-warning/10" />
              <div className="absolute top-10 left-10 w-32 h-32 rounded-full bg-accent/30 blur-2xl" />
              <div className="absolute bottom-10 right-20 w-40 h-40 rounded-full bg-info/20 blur-3xl" />
              <div className="absolute top-20 right-10 w-24 h-24 rounded-full bg-warning/20 blur-2xl" />
            </div>

            <div className="relative grid grid-cols-1 md:grid-cols-2 gap-sp-3 p-sp-4">
              <div className="glass rounded-card p-sp-3 grain">
                <h3 className="text-h3 relative z-10">Default Glass</h3>
                <p className="text-body-sm text-muted-foreground relative z-10">backdrop-blur 20px, 8% opacity</p>
              </div>
              <div className="glass-elevated rounded-panel p-sp-3 grain">
                <h3 className="text-h3 relative z-10">Elevated Glass</h3>
                <p className="text-body-sm text-muted-foreground relative z-10">backdrop-blur 24px, 12% opacity</p>
              </div>
              <div className="glass-modal rounded-modal p-sp-3 grain">
                <h3 className="text-h3 relative z-10">Modal Glass</h3>
                <p className="text-body-sm text-muted-foreground relative z-10">backdrop-blur 24px, 14% opacity</p>
              </div>
              <div className="glass-sidebar rounded-card p-sp-3 grain">
                <h3 className="text-h3 relative z-10">Sidebar Glass</h3>
                <p className="text-body-sm text-muted-foreground relative z-10">backdrop-blur 16px, 6% opacity</p>
              </div>
            </div>
          </div>
        </section>

        {/* === Grain Overlay === */}
        <section>
          <h2 className="text-h2 mb-sp-3">Grain / Noise Overlay</h2>
          <div className="flex gap-sp-3">
            <div className="w-40 h-24 rounded-card bg-gradient-to-br from-accent to-info" />
            <div className="w-40 h-24 rounded-card bg-gradient-to-br from-accent to-info grain" />
          </div>
          <p className="text-body-sm text-muted-foreground mt-sp-1">Left: without grain — Right: with 3% grain overlay</p>
        </section>
      </main>
    </div>
  );
};

export default ThemeDemo;
