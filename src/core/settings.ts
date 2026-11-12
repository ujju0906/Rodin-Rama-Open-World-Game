import type { QualityName } from '../data/quality';

const KEY = 'ramayana.settings.v1';

export interface Settings {
  quality?: QualityName;
}

export function loadSettings(): Settings {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Settings;
  } catch {
    return {};
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage can be unavailable; settings then last for the session only */
  }
}
