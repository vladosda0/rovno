import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 glass px-sp-4 py-sp-2">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-h3">{t("themeDemo.title")}</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-sp-4 py-sp-6 space-y-sp-6">
        {/* === Colors === */}
        <section>
          <h2 className="text-h2 mb-sp-3">{t("themeDemo.sections.colors")}</h2>

          <div className="space-y-sp-4">
            <div>
              <h3 className="text-h3 mb-sp-2 text-muted-foreground">{t("themeDemo.sections.colorsBase")}</h3>
              <div className="flex flex-wrap gap-sp-3">
                <ColorSwatch name={t("themeDemo.colors.background")} variable="background" />
                <ColorSwatch name={t("themeDemo.colors.foreground")} variable="foreground" />
                <ColorSwatch name={t("themeDemo.colors.card")} variable="card" />
                <ColorSwatch name={t("themeDemo.colors.primary")} variable="primary" />
                <ColorSwatch name={t("themeDemo.colors.secondary")} variable="secondary" />
                <ColorSwatch name={t("themeDemo.colors.muted")} variable="muted" />
                <ColorSwatch name={t("themeDemo.colors.border")} variable="border" />
              </div>
            </div>

            <div>
              <h3 className="text-h3 mb-sp-2 text-muted-foreground">{t("themeDemo.sections.colorsSemantic")}</h3>
              <div className="flex flex-wrap gap-sp-3">
                <ColorSwatch name={t("themeDemo.colors.accent")} variable="accent" />
                <ColorSwatch name={t("themeDemo.colors.success")} variable="success" />
                <ColorSwatch name={t("themeDemo.colors.warning")} variable="warning" />
                <ColorSwatch name={t("themeDemo.colors.destructive")} variable="destructive" />
                <ColorSwatch name={t("themeDemo.colors.info")} variable="info" />
              </div>
            </div>
          </div>
        </section>

        {/* === Typography === */}
        <section>
          <h2 className="text-h2 mb-sp-3">{t("themeDemo.sections.typography")}</h2>
          <div className="space-y-sp-2 glass rounded-panel p-sp-4">
            <p className="text-h1">{t("themeDemo.typography.h1")}</p>
            <p className="text-h2">{t("themeDemo.typography.h2")}</p>
            <p className="text-h3">{t("themeDemo.typography.h3")}</p>
            <p className="text-body">{t("themeDemo.typography.body")}</p>
            <p className="text-body-sm text-muted-foreground">{t("themeDemo.typography.bodySmall")}</p>
            <p className="text-caption text-muted-foreground">{t("themeDemo.typography.caption")}</p>
          </div>
        </section>

        {/* === Spacing === */}
        <section>
          <h2 className="text-h2 mb-sp-3">{t("themeDemo.sections.spacing")}</h2>
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
          <h2 className="text-h2 mb-sp-3">{t("themeDemo.sections.radii")}</h2>
          <div className="flex flex-wrap gap-sp-3">
            {[
              { labelKey: "themeDemo.radii.card", cls: "rounded-card" },
              { labelKey: "themeDemo.radii.panel", cls: "rounded-panel" },
              { labelKey: "themeDemo.radii.modal", cls: "rounded-modal" },
              { labelKey: "themeDemo.radii.pill", cls: "rounded-pill" },
            ].map(({ labelKey, cls }) => (
              <div key={cls} className="flex flex-col items-center gap-2">
                <div className={`w-24 h-16 border-2 border-accent ${cls}`} />
                <span className="text-caption text-muted-foreground">{t(labelKey)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* === Glass Surfaces === */}
        <section>
          <h2 className="text-h2 mb-sp-3">{t("themeDemo.sections.glass")}</h2>
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
                <h3 className="text-h3 relative z-10">{t("themeDemo.glass.default.title")}</h3>
                <p className="text-body-sm text-muted-foreground relative z-10">{t("themeDemo.glass.default.subtitle")}</p>
              </div>
              <div className="glass-elevated rounded-panel p-sp-3 grain">
                <h3 className="text-h3 relative z-10">{t("themeDemo.glass.elevated.title")}</h3>
                <p className="text-body-sm text-muted-foreground relative z-10">{t("themeDemo.glass.elevated.subtitle")}</p>
              </div>
              <div className="glass-modal rounded-modal p-sp-3 grain">
                <h3 className="text-h3 relative z-10">{t("themeDemo.glass.modal.title")}</h3>
                <p className="text-body-sm text-muted-foreground relative z-10">{t("themeDemo.glass.modal.subtitle")}</p>
              </div>
              <div className="glass-sidebar rounded-card p-sp-3 grain">
                <h3 className="text-h3 relative z-10">{t("themeDemo.glass.sidebar.title")}</h3>
                <p className="text-body-sm text-muted-foreground relative z-10">{t("themeDemo.glass.sidebar.subtitle")}</p>
              </div>
            </div>
          </div>
        </section>

        {/* === Grain Overlay === */}
        <section>
          <h2 className="text-h2 mb-sp-3">{t("themeDemo.sections.grain")}</h2>
          <div className="flex gap-sp-3">
            <div className="w-40 h-24 rounded-card bg-gradient-to-br from-accent to-info" />
            <div className="w-40 h-24 rounded-card bg-gradient-to-br from-accent to-info grain" />
          </div>
          <p className="text-body-sm text-muted-foreground mt-sp-1">{t("themeDemo.grain.caption")}</p>
        </section>
      </main>
    </div>
  );
};

export default ThemeDemo;
