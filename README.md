# Distance From Home

Chrome extension: highlight a postcode or address on any web page and see
driving distance and time from your home, without leaving the page.

## Setup

1. **Get a Google Maps Platform API key** at
   [console.cloud.google.com](https://console.cloud.google.com/google/maps-apis).
   Enable the **Directions API** and **Geocoding API** on the project the key
   belongs to. Restrict the key to those two APIs.
2. **Download the extension** from GitHub (Chrome can't install directly
   from a GitHub URL — you need the files on disk first):
   - **Option A — download as ZIP (no git required):** on the
     [repository page](https://github.com/Topsy31/Distance), click **Code**
     → **Download ZIP**, then extract it somewhere permanent (don't
     install from inside your Downloads folder if you plan to clear it
     out — Chrome needs the folder to keep existing).
   - **Option B — clone with git:**
     `git clone https://github.com/Topsy31/Distance.git`
3. **Load the extension**: open `chrome://extensions`, enable *Developer
   mode* (toggle, top right), click *Load unpacked*, and select the
   folder you downloaded or cloned in step 2.
4. Click the extension's toolbar icon → **Settings**. At the top, pick
   **Kilometers** or **Miles** — saved instantly, switch anytime. Then
   enter:
   - A **passphrase** — this encrypts everything below before it's saved.
     Pick something you'll remember; it's never stored anywhere, so it
     can't be recovered if you forget it (you'd just re-enter your API key
     and address and set a new one).
   - Your **API key**
   - Your **home address** (it's geocoded once and stored as coordinates)
5. Click **Save & encrypt**.

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

## Getting a Google Maps API key

The extension needs a Google Maps Platform API key to call the Directions
and Geocoding APIs. Google requires a billing account even for free-tier
usage, but the free monthly credit comfortably covers normal personal use.

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and
   sign in with your Google account.
2. Create a new project (or select an existing one) from the project
   picker at the top of the page.
3. Set up billing for the project if you haven't already: **Billing** in
   the left-hand menu → link or create a billing account. A card is
   required, but you won't be charged unless you exceed the free monthly
   credit.
4. Go to **APIs & Services** → **Library** and enable both:
   - **Directions API**
   - **Geocoding API**
5. Go to **APIs & Services** → **Credentials** → **Create credentials** →
   **API key**. Copy the key that's generated.
6. Restrict the key (recommended, click **Edit** on the key):
   - Under **API restrictions**, choose **Restrict key** and select only
     **Directions API** and **Geocoding API**.
   - Under **Application restrictions**, you can leave this as **None**,
     since the extension calls the APIs from its background service
     worker rather than from a browser page or IP address Google can
     reliably match.
7. Save, then paste the key into the extension's **Settings** page as
   described above.

If lookups start failing later, check **APIs & Services** → **Enabled
APIs** to confirm both APIs are still enabled, and **Billing** to confirm
the account is still active.

## Notes

- No custom geocoding/roads dataset is built or maintained — all routing
  comes from the Directions API in real time.
