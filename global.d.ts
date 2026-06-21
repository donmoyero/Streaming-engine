// Global type augmentation so TypeScript allows window.tmi.
declare global {
  interface Window {
    tmi?: any;
  }
}

declare module 'tmi.js';

export {};
