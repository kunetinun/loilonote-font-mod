chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url || !tab.url.startsWith("https://loilonote.app/")) {
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (typeof window.__loiloFontModToggle === "function") {
          window.__loiloFontModToggle();
        } else {
          // content script not loaded yet; inject it
          console.warn("LoiLoNote Font MOD: content script not loaded");
        }
      },
    });
  } catch (e) {
    console.error("LoiLoNote Font MOD toggle failed", e);
    // try injecting content script as fallback
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
    } catch (e2) {
      console.error("LoiLoNote Font MOD inject failed", e2);
    }
  }
});