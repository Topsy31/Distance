const passphraseInput = document.getElementById("passphrase");
const apiKeyInput = document.getElementById("apiKey");
const homeAddressInput = document.getElementById("homeAddress");
const unlockStatus = document.getElementById("unlockStatus");
const saveStatus = document.getElementById("saveStatus");
const unitsInputs = document.querySelectorAll('input[name="units"]');
const showReturnDistanceInput = document.getElementById("showReturnDistance");

chrome.storage.local.get(["units"], ({ units }) => {
  const value = units === "imperial" ? "imperial" : "metric";
  document.querySelector(`input[name="units"][value="${value}"]`).checked = true;
});

unitsInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked) chrome.storage.local.set({ units: input.value });
  });
});

chrome.storage.local.get(["showReturnDistance"], ({ showReturnDistance }) => {
  showReturnDistanceInput.checked = !!showReturnDistance;
});

showReturnDistanceInput.addEventListener("change", () => {
  chrome.storage.local.set({ showReturnDistance: showReturnDistanceInput.checked });
});

document.getElementById("unlock").addEventListener("click", async () => {
  const passphrase = passphraseInput.value;
  if (!passphrase) {
    setStatus(unlockStatus, "Enter your passphrase first.", "error");
    return;
  }

  setStatus(unlockStatus, "Unlocking…", null);

  chrome.runtime.sendMessage({ type: "UNLOCK", passphrase }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus(unlockStatus, chrome.runtime.lastError.message, "error");
      return;
    }
    if (!response?.ok) {
      setStatus(unlockStatus, response?.error || "Could not unlock.", "error");
      return;
    }

    const { apiKey, home } = response.result;
    apiKeyInput.value = apiKey || "";
    homeAddressInput.value = home?.address || "";
    setStatus(unlockStatus, "Unlocked. Edit below, then Save & encrypt.", "success");
  });
});

document.getElementById("save").addEventListener("click", async () => {
  const passphrase = passphraseInput.value;
  const apiKey = apiKeyInput.value.trim();
  const homeAddress = homeAddressInput.value.trim();

  if (!passphrase) {
    setStatus(saveStatus, "Choose a passphrase first.", "error");
    return;
  }
  if (!apiKey) {
    setStatus(saveStatus, "Enter an API key.", "error");
    return;
  }
  if (!homeAddress) {
    setStatus(saveStatus, "Enter a home address.", "error");
    return;
  }

  setStatus(saveStatus, "Encrypting and saving…", null);

  chrome.runtime.sendMessage(
    { type: "SAVE_VAULT", passphrase, apiKey, homeAddress },
    (response) => {
      if (chrome.runtime.lastError) {
        setStatus(saveStatus, chrome.runtime.lastError.message, "error");
        return;
      }
      if (!response?.ok) {
        setStatus(saveStatus, response?.error || "Save failed.", "error");
        return;
      }
      setStatus(saveStatus, `Saved and encrypted. Home: ${response.result.formattedAddress}`, "success");
    }
  );
});

const guide = document.getElementById("guide");
const guideOverlay = document.getElementById("guideOverlay");

function openGuide() {
  guideOverlay.hidden = false;
  guide.hidden = false;
  guide.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => guide.classList.add("open"));
}

function closeGuide() {
  guide.classList.remove("open");
  guide.setAttribute("aria-hidden", "true");
  guideOverlay.hidden = true;
  const done = () => {
    guide.hidden = true;
    guide.removeEventListener("transitionend", done);
  };
  guide.addEventListener("transitionend", done);
}

document.getElementById("showGuide").addEventListener("click", openGuide);
document.getElementById("closeGuide").addEventListener("click", closeGuide);
guideOverlay.addEventListener("click", closeGuide);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !guide.hidden) closeGuide();
});

function setStatus(el, text, kind) {
  el.textContent = text;
  el.classList.remove("error", "success");
  if (kind) el.classList.add(kind);
}
