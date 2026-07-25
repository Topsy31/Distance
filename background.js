// Background service worker.
// Owns all calls to the Google Maps Platform APIs and all encryption of
// sensitive data, so the API key and home address never have to live in a
// content script, and requests aren't subject to each page's CORS/CSP.
//
// Sensitive data (API key + home address/coordinates) is stored encrypted
// at rest: chrome.storage.local holds only an encrypted "vault" (ciphertext
// + salt + iv), never plaintext. The AES-GCM key is derived from a
// passphrase the user enters — that passphrase is never itself persisted.
// Once unlocked, the decrypted values live only in chrome.storage.session,
// which is memory-only and is cleared automatically when the browser
// closes, so the extension re-locks itself every browser session.

const DIRECTIONS_ENDPOINT = "https://maps.googleapis.com/maps/api/directions/json";
const GEOCODE_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";
const PBKDF2_ITERATIONS = 600000;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    return false;
  }

  const handlers = {
    LOOKUP_DISTANCE: () => lookupDistance(message.text),
    SAVE_VAULT: () => saveVault(message.passphrase, message.apiKey, message.homeAddress),
    UNLOCK: () => unlock(message.passphrase),
    LOCK: () => lock(),
  };

  const handler = handlers[message?.type];
  if (!handler) return false;

  handler()
    .then((result) => {
      sendResponse({ ok: true, result });
      syncBadge();
    })
    .catch((err) => sendResponse({ ok: false, error: err.message }));
  return true; // keep the message channel open for the async response
});

// The service worker can be killed and woken at any time (not just browser
// launch), so badge state is recomputed from storage on every script
// evaluation. onStartup is also listened for explicitly since a fresh
// browser launch may not otherwise wake the worker until a message arrives.
syncBadge();
chrome.runtime.onStartup.addListener(syncBadge);

async function syncBadge() {
  const { vault } = await chrome.storage.local.get(["vault"]);
  const { unlocked } = await chrome.storage.session.get(["unlocked"]);

  const locked = !!vault && !unlocked;
  await chrome.action.setBadgeText({ text: locked ? "•" : "" });
  if (locked) {
    await chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
  }
}

// ---------- Session / vault helpers ----------

async function getSession() {
  const { unlocked, apiKey, home } = await chrome.storage.session.get([
    "unlocked",
    "apiKey",
    "home",
  ]);
  return { unlocked: !!unlocked, apiKey, home };
}

async function lock() {
  await chrome.storage.session.remove(["unlocked", "apiKey", "home"]);
  return {};
}

async function unlock(passphrase) {
  if (!passphrase) throw new Error("Enter your passphrase.");

  const { vault } = await chrome.storage.local.get(["vault"]);
  if (!vault) {
    throw new Error("Nothing saved yet. Open settings to add your API key and home address.");
  }

  const { apiKey, home } = await decryptVault(passphrase, vault);
  await chrome.storage.session.set({ unlocked: true, apiKey, home });
  return { apiKey, home };
}

async function saveVault(passphrase, apiKey, homeAddress) {
  if (!passphrase || passphrase.length < 4) {
    throw new Error("Choose a passphrase (at least 4 characters).");
  }
  if (!apiKey) throw new Error("Enter an API key.");
  if (!homeAddress) throw new Error("Enter a home address.");

  const geocoded = await geocodeAddress(homeAddress, apiKey);
  const home = {
    address: homeAddress,
    formattedAddress: geocoded.formattedAddress,
    lat: geocoded.lat,
    lng: geocoded.lng,
  };

  const vault = await encryptVault(passphrase, { apiKey, home });
  await chrome.storage.local.set({ vault });
  await chrome.storage.session.set({ unlocked: true, apiKey, home });

  return { formattedAddress: home.formattedAddress };
}

// ---------- Google Maps Platform calls ----------

async function lookupDistance(destinationText) {
  const { enabled, units } = await chrome.storage.local.get(["enabled", "units"]);
  if (enabled === false) {
    throw new Error("Distance From Home is turned off.");
  }

  const { unlocked, apiKey, home } = await getSession();
  const { vault } = await chrome.storage.local.get(["vault"]);

  if (!vault) {
    throw new Error("Not set up yet. Open settings to add your API key and home address.");
  }
  if (!unlocked || !apiKey || !home?.lat) {
    throw new Error("Locked. Click the toolbar icon and enter your passphrase to unlock.");
  }
  if (!destinationText || !destinationText.trim()) {
    throw new Error("No address selected.");
  }

  const url = new URL(DIRECTIONS_ENDPOINT);
  url.searchParams.set("origin", `${home.lat},${home.lng}`);
  url.searchParams.set("destination", destinationText.trim());
  url.searchParams.set("mode", "driving");
  url.searchParams.set("units", units === "imperial" ? "imperial" : "metric");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Directions request failed (HTTP ${res.status}).`);
  }
  const data = await res.json();

  if (data.status !== "OK") {
    throw new Error(directionsErrorMessage(data.status));
  }

  const route = data.routes?.[0];
  const leg = route?.legs?.[0];
  if (!leg) {
    throw new Error("No route found.");
  }

  return {
    distanceText: leg.distance?.text ?? "?",
    durationText: leg.duration?.text ?? "?",
    destinationAddress: leg.end_address ?? destinationText.trim(),
    mapsUrl: buildMapsUrl(home, leg.end_address ?? destinationText.trim()),
  };
}

function buildMapsUrl(home, destinationAddress) {
  const url = new URL("https://www.google.com/maps/dir/?api=1");
  url.searchParams.set("origin", `${home.lat},${home.lng}`);
  url.searchParams.set("destination", destinationAddress);
  url.searchParams.set("travelmode", "driving");
  return url.toString();
}

async function geocodeAddress(address, apiKey) {
  if (!apiKey) throw new Error("Enter an API key first.");
  if (!address || !address.trim()) throw new Error("Enter an address first.");

  const url = new URL(GEOCODE_ENDPOINT);
  url.searchParams.set("address", address.trim());
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Geocoding request failed (HTTP ${res.status}).`);
  }
  const data = await res.json();

  if (data.status !== "OK") {
    throw new Error(directionsErrorMessage(data.status));
  }

  const result = data.results?.[0];
  if (!result) {
    throw new Error("Address not found.");
  }

  return {
    formattedAddress: result.formatted_address,
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
  };
}

function directionsErrorMessage(status) {
  switch (status) {
    case "ZERO_RESULTS":
      return "No driving route could be found for that address.";
    case "NOT_FOUND":
      return "That address couldn't be located.";
    case "REQUEST_DENIED":
      return "The API key was rejected. Check it in settings.";
    case "OVER_QUERY_LIMIT":
      return "API quota exceeded. Try again later.";
    case "INVALID_REQUEST":
      return "That selection isn't a valid address.";
    default:
      return `Lookup failed (${status}).`;
  }
}

// ---------- Encryption (WebCrypto: PBKDF2 -> AES-GCM) ----------

async function deriveKey(passphrase, saltBytes) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptVault(passphrase, plainObj) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const data = new TextEncoder().encode(JSON.stringify(plainObj));
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);

  return {
    salt: bufToB64(salt),
    iv: bufToB64(iv),
    cipher: bufToB64(new Uint8Array(cipherBuf)),
  };
}

async function decryptVault(passphrase, vault) {
  const salt = b64ToBuf(vault.salt);
  const iv = b64ToBuf(vault.iv);
  const cipher = b64ToBuf(vault.cipher);
  const key = await deriveKey(passphrase, salt);

  let plainBuf;
  try {
    plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  } catch {
    throw new Error("Incorrect passphrase.");
  }

  return JSON.parse(new TextDecoder().decode(plainBuf));
}

function bufToB64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function b64ToBuf(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
