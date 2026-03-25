const EXTENSION_STATUS_TTL_MS = 1000 * 60 * 15;

const extensionStatusStore = {
  lastSeenAt: null,
  connected: false,
  browser: null,
  pageType: null,
  extensionVersion: null,
  appVersion: '0.1.0',
  installSource: null,
  installationId: null,
  shopUrl: null,
  listingUrl: null
};

function cloneStatus() {
  return { ...extensionStatusStore };
}

export function updateExtensionStatus(payload = {}) {
  extensionStatusStore.lastSeenAt = new Date().toISOString();
  extensionStatusStore.connected = true;
  extensionStatusStore.browser = payload.browser ?? extensionStatusStore.browser;
  extensionStatusStore.pageType = payload.pageType ?? extensionStatusStore.pageType;
  extensionStatusStore.extensionVersion = payload.extensionVersion ?? extensionStatusStore.extensionVersion;
  extensionStatusStore.installSource = payload.installSource ?? extensionStatusStore.installSource;
  extensionStatusStore.installationId = payload.installationId ?? extensionStatusStore.installationId;
  extensionStatusStore.shopUrl = payload.shopUrl ?? extensionStatusStore.shopUrl;
  extensionStatusStore.listingUrl = payload.listingUrl ?? extensionStatusStore.listingUrl;
  return cloneStatus();
}

export function getExtensionStatus() {
  const status = cloneStatus();
  if (!status.lastSeenAt) {
    return {
      ...status,
      ready: false,
      stale: false
    };
  }

  const ageMs = Date.now() - new Date(status.lastSeenAt).getTime();
  const stale = ageMs > EXTENSION_STATUS_TTL_MS;
  return {
    ...status,
    connected: !stale,
    stale,
    ready: !stale
  };
}
