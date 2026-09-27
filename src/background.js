import { getClip, putClip, normalizeText, cacheKey } from './db.js';
import { getSettings } from './settings.js';

const TTS_URL = 'https://api.fish.audio/v1/tts';
const OFFSCREEN_URL = 'src/offscreen.html';

const inflight = new Map(); // cacheKey -> Promise<clip>, dedupes double clicks
let playingTabId = null;
let creatingOffscreen = null;

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target === 'offscreen') return false;

  switch (msg?.type) {
    case 'speak':
      speak(msg.text, sender.tab?.id).then(sendResponse, (err) =>
        sendResponse({ ok: false, error: err.message })
      );
      return true;
    case 'stop':
      stop().then(() => sendResponse({ ok: true }));
      return true;
    case 'open-options':
      chrome.runtime.openOptionsPage();
      return false;
    case 'playback-ended':
      notifyEnded();
      return false;
  }
  return false;
});

async function speak(rawText, tabId) {
  const text = normalizeText(rawText);
  if (!text) throw new Error('Nothing to read.');

  const settings = await getSettings();
  const key = await cacheKey({ text, ...settings });

  let clip = await getClip(key);
  const cached = Boolean(clip);
  if (!clip) {
    if (!settings.apiKey) throw new Error('NO_API_KEY');
    if (!inflight.has(key)) {
      inflight.set(key, generate(text, key, settings).finally(() => inflight.delete(key)));
    }
    clip = await inflight.get(key);
  }

  await play(key, tabId);
  return { ok: true, cached };
}

async function generate(text, key, settings) {
  const body = { text, format: 'mp3' };
  if (settings.voiceId) body.reference_id = settings.voiceId.trim();
  const speed = Number(settings.speed) || 1;
  if (speed !== 1) body.prosody = { speed };

  const headers = {
    Authorization: `Bearer ${settings.apiKey.trim()}`,
    'Content-Type': 'application/json',
  };
  if (settings.model) headers.model = settings.model;

  const res = await fetch(TTS_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('Fish Audio rejected the API key (401).');
    if (res.status === 402) throw new Error('Fish Audio: out of credits (402).');
    throw new Error(`Fish Audio error ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }

  const audio = await res.blob();
  if (!audio.size) throw new Error('Fish Audio returned empty audio.');

  const clip = {
    key,
    text,
    voiceId: settings.voiceId || '',
    model: settings.model || '',
    speed,
    blob: new Blob([audio], { type: 'audio/mpeg' }),
    size: audio.size,
    createdAt: Date.now(),
  };
  await putClip(clip);
  return clip;
}

async function ensureOffscreen() {
  const url = chrome.runtime.getURL(OFFSCREEN_URL);
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [url],
  });
  if (existing.length) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_URL,
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Play generated Korean TTS audio.',
      })
      .finally(() => (creatingOffscreen = null));
  }
  await creatingOffscreen;
}

async function play(key, tabId) {
  await ensureOffscreen();
  if (playingTabId !== null && playingTabId !== tabId) notifyEnded();
  playingTabId = tabId ?? null;
  const res = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'play', key });
  if (!res?.ok) throw new Error(res?.error || 'Playback failed.');
}

async function stop() {
  const url = chrome.runtime.getURL(OFFSCREEN_URL);
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [url],
  });
  if (existing.length) await chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' });
  notifyEnded();
}

function notifyEnded() {
  if (playingTabId === null) return;
  chrome.tabs.sendMessage(playingTabId, { type: 'playback-ended' }).catch(() => {});
  playingTabId = null;
}
