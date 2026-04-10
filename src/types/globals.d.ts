declare global {
  interface Window {
    /** Registered by App.tsx in Tauri builds. Called by Rust via window.eval() on close/quit. */
    __tauriCloseRequested?: () => void;
  }
}

export {};
