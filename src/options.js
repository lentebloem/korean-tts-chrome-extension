import { listClips, deleteClip, clearClips } from './db.js';
import { getSettings, MODELS } from './settings.js';

const $ = (id) => document.getElementById(id);
const form = $('settings');

let clips = [];
let audio = null;
let audioUrl = null;

async function loadSettings() {
  const s = await getSettings();
  const models = MODELS.includes(s.model) ? MODELS : [s.model, ...MODELS];
  $('model').innerHTML = models.map((m) => `<option value="${m}">${m}</option>`).join('');
  $('apiKey').value = s.apiKey;
  $('voiceId').value = s.voiceId;
  $('model').value = s.model;
  $('speed').value = s.speed;
  $('speedOut').textContent = `${Number(s.speed).toFixed(2)}×`;
}

$('speed').addEventListener('input', (e) => {
  $('speedOut').textContent = `${Number(e.target.value).toFixed(2)}×`;
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  await chrome.storage.local.set({
    apiKey: $('apiKey').value.trim(),
    voiceId: $('voiceId').value.trim(),
    model: $('model').value,
    speed: Number($('speed').value),
  });
  $('saved').hidden = false;
  setTimeout(() => ($('saved').hidden = true), 1500);
});

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function stopAudio() {
  if (audio) audio.pause();
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audio = audioUrl = null;
}

function render() {
  const q = $('filter').value.trim().toLowerCase();
  const shown = clips.filter((c) => !q || c.text.toLowerCase().includes(q));
  const total = clips.reduce((sum, c) => sum + (c.size || 0), 0);
  $('cacheStats').textContent = `${clips.length} clip${clips.length === 1 ? '' : 's'} · ${formatBytes(total)}`;
  $('empty').hidden = clips.length > 0;
  $('clearAll').disabled = clips.length === 0;

  const list = $('clips');
  list.replaceChildren(
    ...shown.map((clip) => {
      const li = document.createElement('li');
      const text = document.createElement('div');
      text.className = 'text';
      text.textContent = clip.text;
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = [
        new Date(clip.createdAt).toLocaleString(),
        clip.model,
        clip.voiceId ? `voice ${clip.voiceId.slice(0, 8)}…` : 'default voice',
        clip.speed !== 1 ? `${clip.speed}×` : null,
        formatBytes(clip.size),
      ]
        .filter(Boolean)
        .join(' · ');
      text.append(meta);

      const play = document.createElement('button');
      play.textContent = 'Play';
      play.addEventListener('click', () => {
        stopAudio();
        audioUrl = URL.createObjectURL(clip.blob);
        audio = new Audio(audioUrl);
        audio.play();
      });

      const del = document.createElement('button');
      del.textContent = 'Delete';
      del.className = 'danger';
      del.addEventListener('click', async () => {
        await deleteClip(clip.key);
        clips = clips.filter((c) => c.key !== clip.key);
        render();
      });

      li.append(text, play, del);
      return li;
    })
  );
}

async function loadClips() {
  clips = (await listClips()).sort((a, b) => b.createdAt - a.createdAt);
  render();
}

$('filter').addEventListener('input', render);
$('clearAll').addEventListener('click', async () => {
  if (!confirm(`Delete all ${clips.length} cached clips? They will need to be regenerated.`)) return;
  stopAudio();
  await clearClips();
  clips = [];
  render();
});

// Pick up clips generated in other tabs while this page is open.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadClips();
});

loadSettings();
loadClips();
