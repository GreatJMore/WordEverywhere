// 后台服务：处理快捷键、名言弹窗与跨页面消息

try {
  importScripts("quotes.js");
} catch (e) {
  console.warn("quotes load failed", e);
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-panel") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || tab.id == null) return;
      chrome.tabs.sendMessage(tab.id, { type: "togglePanel" }).catch?.(() => {});
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "getQuote") {
    const quotes = globalThis.WINDOW_QUOTES || [];
    sendResponse(quotes[Math.floor(Math.random() * quotes.length)]);
    return true;
  }
  if (message && message.type === "openOptions") {
    chrome.runtime.openOptionsPage?.();
    sendResponse({ ok: true });
  }
  return false;
});
