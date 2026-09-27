# Fish Korean TTS (Chrome extension)

Select Korean text on any page → click the blue speaker icon → hear it via [Fish Audio](https://fish.audio) TTS.

Generated audio is cached in IndexedDB. Selecting the same text again replays the cached clip without calling the API.

## Install
1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → choose this folder.
3. The settings page opens on install (or click the toolbar icon). Paste your Fish Audio API key, and optionally a Korean voice ID.

## Usage
- Select text containing Hangul (up to 3000 chars). A speaker icon appears at the end of the selection.
- Click it to play. While playing it becomes a green stop button. `Esc` also stops playback.
- The settings page lists every cached clip (play / delete / clear all).

## Caching
The cache key is SHA-256 of `(normalized text, voice ID, model, speed)`. Whitespace is collapsed and the text is NFC-normalized, so re-selecting the same sentence hits the cache. Changing the voice/model/speed produces a new clip for the new settings.

## Files
- `src/background.js`: calls `POST https://api.fish.audio/v1/tts`, manages the cache, and dedupes concurrent requests.
- `src/content.js`: selection detection and the floating icon (Shadow DOM, so page styles can't interfere).
- `src/offscreen.*`: plays audio in an offscreen document, so page CSP can't block it.
- `src/db.js`: IndexedDB helpers and the cache key.
- `src/options.*`: settings and cache browser.
