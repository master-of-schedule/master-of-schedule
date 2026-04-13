declare global {
  interface Window {
    __tauriCloseRequested?: () => void;
  }
}

export {};
