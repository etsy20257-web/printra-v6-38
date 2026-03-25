const apiBaseInput = document.getElementById('apiBase');
const feedback = document.getElementById('feedback');

async function withActiveTab(actionType) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    feedback.textContent = 'No active tab found.';
    return;
  }
  const result = await chrome.tabs.sendMessage(tab.id, { type: actionType }).catch((error) => ({ ok: false, error: error.message }));
  feedback.textContent = result?.ok ? 'Done.' : `Error: ${result?.error || 'Open an Etsy page first.'}`;
}

document.getElementById('saveApiBase').addEventListener('click', async () => {
  const apiBase = apiBaseInput.value.trim() || 'http://localhost:4000';
  const result = await chrome.runtime.sendMessage({ type: 'PRINTRA_SET_API_BASE', payload: { apiBase } });
  feedback.textContent = result?.ok ? 'API base saved.' : `Error: ${result?.error || 'unknown'}`;
});

document.getElementById('syncStatus').addEventListener('click', async () => {
  await withActiveTab('PRINTRA_TRIGGER_STATUS');
});

document.getElementById('analyzePage').addEventListener('click', async () => {
  await withActiveTab('PRINTRA_TRIGGER_ANALYZE');
});

chrome.runtime.sendMessage({ type: 'PRINTRA_GET_API_BASE' }, (result) => {
  if (result?.ok) {
    apiBaseInput.value = result.apiBase;
  }
});
