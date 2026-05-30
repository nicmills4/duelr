/// <reference types="vite/client" />

import type { DuelrAPI } from '../../preload/index'

declare global {
  interface Window {
    duelr: DuelrAPI
  }
}
