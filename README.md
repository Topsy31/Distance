# Distance From Home

Chrome extension: highlight a postcode or address on any web page and see
driving distance and time from your home, without leaving the page.

## Setup

1. **Get a Google Maps Platform API key** at
   [console.cloud.google.com](https://console.cloud.google.com/google/maps-apis).
   Enable the **Directions API** and **Geocoding API** on the project the key
   belongs to. Restrict the key to those two APIs.
2. **Load the extension**: open `chrome://extensions`, enable *Developer
   mode*, click *Load unpacked*, and select this folder.
3. Click the extension's toolbar icon → **Settings**. At the top, pick
   **Kilometers** or **Miles** — saved instantly, switch anytime. Then
   enter:
   - A **passphrase** — this encrypts everything below before it's saved.
     Pick something you'll remember; it's never stored anywhere, so it
     can't be recovered if you forget it (you'd just re-enter your API key
     and address and set a new one).
   - Your **API key**
   - Your **home address** (it's geocoded once and stored as coordinates)
4. Click **Save & encrypt**.

## Use

Highlight a postcode or address on any page. A small car icon appears next
to the selection — click it to see driving distance and time from home in a
popup on the page. Toggle the extension on/off from the toolbar icon.

Each time you restart your browser, the extension starts **locked** — click
the toolbar icon and enter your passphrase to unlock it for that browsing
session. Use the **Lock** button in the popup to lock it again manually.

## Security model

- Your API key and home address are encrypted (AES-256-GCM, key derived
  from your passphrase via PBKDF2 with 600,000 iterations) before being
  written to disk (`chrome.storage.local`). At rest, only ciphertext is
  stored — never a plaintext key or address.
- The passphrase itself is never stored or transmitted anywhere; it only
  exists in your head and briefly in memory while unlocking.
- Once unlocked, the decrypted values live in `chrome.storage.session`,
  which Chrome keeps in memory only and clears automatically when the
  browser closes — so the extension re-locks itself every session.
- Nothing is synced to your Google account or sent anywhere except Google's
  Directions/Geocoding endpoints (over HTTPS) when you actually look up a
  route.
- If you forget your passphrase, there's no recovery: re-open Settings and
  save your API key and address again with a new passphrase.

This protects your data from anyone who can read the extension's storage
files but doesn't know your passphrase (e.g. another local account,
malware without keylogging, or someone poking around your profile folder).
It does **not** protect against something actively watching your machine
while you type your passphrase or while the extension is unlocked.

## Notes

- No custom geocoding/roads dataset is built or maintained — all routing
  comes from the Directions API in real time.
