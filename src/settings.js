export const DEFAULT_SETTINGS = {
  apiKey: '',
  voiceId: '',
  model: 's2.1-pro',
  speed: 1,
};

export const MODELS = ['s2.1-pro', 's2-pro', 's1', 's2.1-pro-free'];

export async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS, ...stored };
}
