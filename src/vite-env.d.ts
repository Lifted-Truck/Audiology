/// <reference types="vite/client" />

// Safari exposes the constructor under a webkit prefix.
interface Window {
  webkitAudioContext: typeof AudioContext;
}
