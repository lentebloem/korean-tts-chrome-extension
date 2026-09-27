import { getClip } from './db.js';

let audio = null;
let objectUrl = null;

function stop() {
  if (audio) {
    audio.onended = audio.onerror = null;
    audio.pause();
    audio = null;
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

async function play(key) {
  stop();
  const clip = await getClip(key);
  if (!clip) throw new Error('Clip not found in cache.');
  objectUrl = URL.createObjectURL(clip.blob);
  audio = new Audio(objectUrl);
  const ended = () => {
    stop();
    chrome.runtime.sendMessage({ type: 'playback-ended' });
  };
  audio.onended = ended;
  audio.onerror = ended;
  await audio.play();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return false;
  if (msg.type === 'play') {
    play(msg.key).then(
      () => sendResponse({ ok: true }),
      (err) => sendResponse({ ok: false, error: err.message })
    );
    return true;
  }
  if (msg.type === 'stop') {
    stop();
    sendResponse({ ok: true });
  }
  return false;
});
