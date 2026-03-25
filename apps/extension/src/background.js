const DEFAULT_API_BASE = 'http://localhost:4000';

async function getApiBase() {
  const stored = await chrome.storage.local.get(['apiBase']);
  return (stored.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
}

async function postJson(path, body) {
  const apiBase = await getApiBase();
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await chrome.storage.local.set({ apiBase: DEFAULT_API_BASE, installSource: reason || 'installed' });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'PRINTRA_EXTENSION_STATUS') {
    postJson('/automatic-analysis/extension-status', message.payload)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'PRINTRA_EXTENSION_INGEST') {
    postJson('/automatic-analysis/extension-ingest', message.payload)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'PRINTRA_SET_API_BASE') {
    chrome.storage.local.set({ apiBase: String(message.payload?.apiBase || DEFAULT_API_BASE) })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'PRINTRA_GET_API_BASE') {
    getApiBase()
      .then((apiBase) => sendResponse({ ok: true, apiBase }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
