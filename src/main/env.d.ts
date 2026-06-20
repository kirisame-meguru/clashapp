/// <reference types="electron-vite/node" />

// Vite's `?raw` suffix import (electron-vite/node does not declare it for the
// main process, unlike vite/client in the renderer).
declare module '*?raw' {
  const content: string
  export default content
}
