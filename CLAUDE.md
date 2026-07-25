# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

This repository builds a Chrome extension that estimates road distance and travel time from a fixed location (nominally the user's home) to a postcode or address highlighted on the current web page.

Core behavior:
- The user highlights/selects a postcode or address on any web page.
- The extension estimates driving distance and driving time (fastest route) from the home location to that address.
- Results are shown without navigating away from or otherwise disrupting the page the user is on (e.g. a popup, overlay, or browser action UI — not a redirect to a routing site).
- The extension is always on and easily accessible on every page once enabled — no per-site setup or activation step should be required beyond the initial toggle.

Constraints:
- Must use an existing routing/geocoding MCP or API for road distance and time (e.g. a mapping/directions provider). Do not build or maintain a custom roads/geocoding dataset.
- Route and time estimates must reflect real, accurate road routing (not straight-line/as-the-crow-flies distance).
- Output should be simple to read at a glance: distance by road and journey time, clearly labeled.

## Architecture

Manifest V3, vanilla JS, no build step or bundler — every `.js` file is loaded as-is.

- `manifest.json` — MV3 config. `storage` permission (covers both `storage.local` and `storage.session`); `host_permissions` scoped to `maps.googleapis.com` (background fetches only). Content script runs on `<all_urls>` with `all_frames: true` (many pages, e.g. helpdesk/ticketing apps, render content inside iframes).
- `background.js` — service worker; the only place that calls the Google Maps Platform APIs (Directions + Geocoding) and the only place that touches WebCrypto. Listens for `LOOKUP_DISTANCE`, `SAVE_VAULT`, `UNLOCK`, `LOCK`, and `OPEN_OPTIONS` runtime messages. `geocodeAddress()` is an internal helper (used by `saveVault()`), not exposed as its own message type.
- `content.js` — injected on every page. Watches for text selection, shows a floating icon next to it (rendered inside a shadow root so page CSS can't interfere either direction), and on click sends `LOOKUP_DISTANCE` to the background worker and renders the result/error in an on-page panel. Never reads the API key, passphrase, or home data itself. No address/postcode format validation is done client-side — any selection is sent to the Directions API and errors are surfaced as-is. Selection detection has two paths: `window.getSelection()` for regular page text, and a `select`-event/`selectionStart`/`selectionEnd` path for text selected inside `<input>`/`<textarea>` fields (which `getSelection()` can't see) — common in admin UIs that render detail panels as inline-editable form fields.
- `options.html` / `options.js` — settings page: units toggle (metric/imperial, saved instantly, unencrypted), passphrase field, API key input, home address input. **Save & encrypt** sends one `SAVE_VAULT` message (background geocodes the address, then encrypts `{apiKey, home}` under the passphrase). **Unlock & edit** (`UNLOCK`) decrypts the existing vault to pre-fill the fields.
- `popup.html` / `popup.js` — toolbar popup: on/off toggle, lock/unlock status, passphrase field + Unlock button when locked, Lock button when unlocked, and a link to settings.

**Routing/geocoding provider:** Google Maps Platform. The Directions API accepts a free-text destination string directly (no separate geocode call needed per lookup) — only the home address is geocoded, once per save, in settings.

**Encryption at rest:** the API key and home address/coordinates are never written to disk as plaintext. `background.js` derives an AES-256-GCM key from the user's passphrase via PBKDF2 (600,000 iterations, SHA-256, random salt per save) and encrypts `{apiKey, home}` as one blob. The passphrase itself is never persisted. See `deriveKey`/`encryptVault`/`decryptVault` in `background.js`.

**Storage schema:**
```
chrome.storage.local (on disk, this-browser-only, not synced):
{
  enabled: boolean,                          // default true
  units: "metric" | "imperial",              // default "metric"; not sensitive, unencrypted
  vault: { salt, iv, cipher }                // base64; AES-GCM ciphertext of {apiKey, home}
}

chrome.storage.session (memory-only, cleared when the browser closes):
{
  unlocked: boolean,
  apiKey: string,
  home: { address, formattedAddress, lat, lng }
}
```

**Message flow:** content script → `chrome.runtime.sendMessage` → background worker → Google Maps Platform → response relayed back to content script for rendering. Settings/popup pages message the background worker rather than calling `fetch` or WebCrypto directly, keeping all external API calls and all encryption in one place. Every browser restart clears `storage.session`, so the extension starts locked and `LOOKUP_DISTANCE` fails with a "locked" error until the user unlocks via the popup or options page.

## Known limitation

Chrome only injects declarative `content_scripts` into frames that actually **navigate** to a URL. Rich-text editors that build their editing surface by creating a blank iframe and writing the document into it with JS (e.g. TinyMCE, used for Deskpro's reply/compose box) never trigger that, so `content.js` cannot run inside them — no manifest setting fixes this. Regular same-origin iframes populated via a real `src` navigation (e.g. Deskpro's requester/admin detail panels) work fine once `all_frames: true` is set.

## Project status

Passphrase-encrypted vault in place (manifest, background worker, content script, options page, popup). Selection detection covers both regular page text and text selected inside `<input>`/`<textarea>` fields. Icons in place at `icons/icon{16,32,48,128}.png` (red car on blue background), wired into both the manifest's top-level `icons` and `action.default_icon`. No build/lint/test tooling exists; there's no bundler because the extension currently has no dependencies to bundle.
