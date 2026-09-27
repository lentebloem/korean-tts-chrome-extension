(() => {
  if (window.__fishKoreanTts) return;
  window.__fishKoreanTts = true;

  const HANGUL = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힯ힰ-퟿]/;
  const MAX_CHARS = 3000;

  const ICONS = {
    speaker:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/></svg>',
    spinner: '<span class="spin"></span>',
  };

  const host = document.createElement('fish-korean-tts');
  host.style.cssText = 'all: initial; position: absolute; top: 0; left: 0; z-index: 2147483647; display: none;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .wrap { position: relative; font: 12px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      button {
        all: unset; box-sizing: border-box; width: 30px; height: 30px; border-radius: 50%;
        display: grid; place-items: center; cursor: pointer; color: #fff;
        background: #2563eb; box-shadow: 0 2px 8px rgba(0,0,0,.28);
        transition: transform .12s ease, background .12s ease;
      }
      button:hover { transform: scale(1.08); background: #1d4ed8; }
      button[data-state="playing"] { background: #16a34a; }
      button[data-state="error"] { background: #dc2626; }
      svg { width: 18px; height: 18px; }
      .spin {
        width: 14px; height: 14px; border-radius: 50%;
        border: 2px solid rgba(255,255,255,.35); border-top-color: #fff;
        animation: r .7s linear infinite;
      }
      @keyframes r { to { transform: rotate(360deg); } }
      .msg {
        position: absolute; top: 36px; left: 0; width: max-content; max-width: 260px;
        padding: 6px 9px; border-radius: 6px; background: #111827; color: #f9fafb;
        box-shadow: 0 2px 8px rgba(0,0,0,.3); white-space: normal;
      }
      .msg[hidden] { display: none; }
      .msg a { color: #93c5fd; cursor: pointer; text-decoration: underline; }
    </style>
    <div class="wrap">
      <button type="button" title="Read aloud with Fish Audio"></button>
      <div class="msg" hidden></div>
    </div>`;
  const button = root.querySelector('button');
  const msgEl = root.querySelector('.msg');

  let currentText = '';
  let state = 'idle';
  let requestId = 0;

  function mount() {
    if (!host.isConnected) (document.body || document.documentElement).appendChild(host);
  }

  function setState(next, message) {
    state = next;
    button.dataset.state = next;
    button.innerHTML = next === 'loading' ? ICONS.spinner : next === 'playing' ? ICONS.stop : ICONS.speaker;
    button.title =
      next === 'playing' ? 'Stop' : next === 'loading' ? 'Generating…' : 'Read aloud with Fish Audio';
    if (message) {
      msgEl.innerHTML = message;
      msgEl.hidden = false;
    } else {
      msgEl.hidden = true;
    }
  }

  function hide() {
    host.style.display = 'none';
    currentText = '';
    msgEl.hidden = true;
  }

  function showAt(x, y) {
    mount();
    const size = 30;
    const vw = document.documentElement.clientWidth || window.innerWidth || x + size + 4;
    const vh = document.documentElement.clientHeight || window.innerHeight || y + size + 4;
    const cx = Math.min(Math.max(4, x), vw - size - 4);
    const cy = Math.min(Math.max(4, y), vh - size - 4);
    host.style.left = `${cx + window.scrollX}px`;
    host.style.top = `${cy + window.scrollY}px`;
    host.style.display = 'block';
  }

  function readSelection() {
    const el = document.activeElement;
    const isField =
      el &&
      (el.tagName === 'TEXTAREA' ||
        (el.tagName === 'INPUT' && /^(text|search|url|)$/i.test(el.type || '')));
    if (isField) {
      try {
        const { selectionStart: s, selectionEnd: e } = el;
        if (s != null && e != null && e > s) return { text: el.value.slice(s, e), rect: null };
      } catch {}
      return { text: '', rect: null };
    }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return { text: '', rect: null };
    const range = sel.getRangeAt(sel.rangeCount - 1);
    const rects = range.getClientRects();
    const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
    return { text: sel.toString(), rect: rect && (rect.width || rect.height) ? rect : null };
  }

  function checkSelection(pointer) {
    const { text, rect } = readSelection();
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_CHARS || !HANGUL.test(trimmed)) {
      if (state !== 'playing' && state !== 'loading') hide();
      return;
    }
    if (trimmed === currentText && host.style.display === 'block') return;
    currentText = trimmed;
    if (state !== 'playing' && state !== 'loading') setState('idle');
    if (rect) showAt(rect.right + 4, rect.bottom + 6);
    else if (pointer) showAt(pointer.x + 8, pointer.y + 12);
  }

  function send(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (res) => {
          const err = chrome.runtime.lastError;
          if (err) reject(new Error(err.message));
          else resolve(res);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  async function onClick() {
    if (state === 'playing' || state === 'loading') {
      requestId++;
      setState('idle');
      send({ type: 'stop' }).catch(() => {});
      return;
    }
    if (!currentText) return;
    const id = ++requestId;
    setState('loading');
    try {
      const res = await send({ type: 'speak', text: currentText });
      if (id !== requestId) return;
      if (!res?.ok) throw new Error(res?.error || 'Unknown error');
      setState('playing');
      button.title = res.cached ? 'Stop (played from cache)' : 'Stop';
    } catch (err) {
      if (id !== requestId) return;
      const m = String(err.message || err);
      if (m === 'NO_API_KEY') {
        setState('error', 'Add your Fish Audio API key first. <a data-open-options>Open settings</a>');
      } else if (/context invalidated|Receiving end does not exist/i.test(m)) {
        setState('error', 'The extension was updated. Reload this page to use it.');
      } else {
        setState('error', escapeHtml(m));
      }
    }
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // Keep the page selection intact when pressing the button.
  button.addEventListener('mousedown', (e) => e.preventDefault());
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  msgEl.addEventListener('mousedown', (e) => e.preventDefault());
  msgEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-options]')) send({ type: 'open-options' }).catch(() => {});
  });

  document.addEventListener(
    'mousedown',
    (e) => {
      if (e.target === host) return;
      if (state !== 'playing' && state !== 'loading') hide();
    },
    true
  );
  document.addEventListener(
    'mouseup',
    (e) => {
      if (e.target === host) return;
      const pointer = { x: e.clientX, y: e.clientY };
      setTimeout(() => checkSelection(pointer), 0);
    },
    true
  );
  document.addEventListener(
    'keyup',
    (e) => {
      if (e.key === 'Escape') {
        if (state === 'playing' || state === 'loading') {
          requestId++;
          send({ type: 'stop' }).catch(() => {});
        }
        setState('idle');
        hide();
        return;
      }
      if (e.shiftKey || e.key === 'Shift' || ((e.metaKey || e.ctrlKey) && e.key === 'a')) {
        checkSelection(null);
      }
    },
    true
  );

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'playback-ended' && state === 'playing') {
      setState('idle');
      if (!readSelection().text.trim()) hide();
    }
  });

  setState('idle');
})();
