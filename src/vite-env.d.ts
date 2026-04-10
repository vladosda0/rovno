/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to `1` or `true` to enable Wave 1 live text assistant (mock client until backend). */
  readonly VITE_AI_LIVE_TEXT_ASSISTANT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
