const enabledToggle = document.getElementById("enabledToggle");
const statusEl = document.getElementById("status");
const unlockSection = document.getElementById("unlockSection");
const passphraseInput = document.getElementById("passphrase");
const unlockError = document.getElementById("unlockError");
const lockBtn = document.getElementById("lock");

render();

async function render() {
  const { enabled, vault } = await chrome.storage.local.get(["enabled", "vault"]);
  const { unlocked, home } = await chrome.storage.session.get(["unlocked", "home"]);

  enabledToggle.checked = enabled !== false;

  if (!vault) {
    statusEl.textContent = "Not set up yet. Open settings to add your API key and home address.";
    unlockSection.classList.add("hidden");
    lockBtn.classList.add("hidden");
    return;
  }

  if (unlocked && home) {
    statusEl.textContent = `Home: ${home.formattedAddress}`;
    unlockSection.classList.add("hidden");
    lockBtn.classList.remove("hidden");
  } else {
    statusEl.textContent = "Locked. Enter your passphrase to unlock.";
    unlockSection.classList.remove("hidden");
    lockBtn.classList.add("hidden");
  }
}

enabledToggle.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: enabledToggle.checked });
});

document.getElementById("unlock").addEventListener("click", () => {
  const passphrase = passphraseInput.value;
  if (!passphrase) {
    unlockError.textContent = "Enter your passphrase.";
    return;
  }
  unlockError.textContent = "";

  chrome.runtime.sendMessage({ type: "UNLOCK", passphrase }, (response) => {
    if (chrome.runtime.lastError) {
      unlockError.textContent = chrome.runtime.lastError.message;
      return;
    }
    if (!response?.ok) {
      unlockError.textContent = response?.error || "Could not unlock.";
      return;
    }
    passphraseInput.value = "";
    render();
  });
});

lockBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "LOCK" }, () => render());
});

document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
