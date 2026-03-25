(function () {
  if (!location.hostname.includes('etsy.com')) return;

  function textFromSelectors(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element?.textContent?.trim()) return element.textContent.trim();
    }
    return '';
  }

  function textList(selectors) {
    const values = [];
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        const value = node.textContent?.trim();
        if (value) values.push(value);
      });
    });
    return [...new Set(values)].slice(0, 12);
  }

  function pageType() {
    if (/\/listing\//.test(location.pathname)) return 'listing';
    if (/\/shop\//.test(location.pathname)) return 'shop';
    return 'unknown';
  }

  function detectBrowser() {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('edg/')) return 'edge';
    if (ua.includes('opr/') || ua.includes('opera')) return 'opera';
    if (navigator.brave) return 'brave';
    if (ua.includes('chrome')) return 'chrome';
    return 'unknown';
  }

  function extractListing() {
    return {
      url: location.href,
      title: textFromSelectors(['h1[data-buy-box-listing-title="true"]', 'h1', '[data-listing-title]']),
      price: textFromSelectors(['[data-buy-box-region="price"] p', '[data-buy-box-region="price"]', '[data-selector="price-only"]']),
      description: textFromSelectors(['[data-id="description-text"]', '#listing-page-cart p', '[data-selector="description-text"]']),
      rating: textFromSelectors(['[data-buy-box-region="rating"]', '[data-rating-stars-container]']),
      reviewCount: textFromSelectors(['a[href*="#reviews"]', '[data-review-count]']),
      imageCount: document.querySelectorAll('button[data-carousel-thumbnail-index], li[data-carousel-index]').length || 0,
      variationCount: document.querySelectorAll('select, [data-selector="listing-page-variation-dropdown"]').length || 0,
      tags: textList(['a[href*="/search?"]', '[data-selector="crumbs-link"]']),
      highlights: textList(['[data-product-details-section] li', 'ul li'])
    };
  }

  function extractShop() {
    return {
      url: location.href,
      about: textFromSelectors(['#shop-about', '[data-shop-home-member-since]']),
      announcement: textFromSelectors(['#announcement', '[data-shop-announcement]']),
      salesCount: textFromSelectors(['[data-shop-sale-count]', 'span']),
      rating: textFromSelectors(['[data-rating-stars-container]', '[data-shop-rating]']),
      reviewCount: textFromSelectors(['a[href*="reviews"]', '[data-review-count]']),
      productCount: document.querySelectorAll('li.wt-list-unstyled div[data-listing-id]').length || 0,
      highlights: textList(['[data-shop-section] li', 'section li'])
    };
  }

  async function send(type) {
    const currentPage = pageType();
    const payload = {
      browser: detectBrowser(),
      installSource: 'content-script',
      installationId: 'local-dev',
      extensionVersion: chrome.runtime.getManifest().version,
      listingUrl: currentPage === 'listing' ? location.href : '',
      storeUrl: currentPage === 'shop' ? location.href : '',
      listing: currentPage === 'listing' ? extractListing() : {},
      shop: currentPage === 'shop' ? extractShop() : {},
      saveToAnalytics: true
    };

    const messageType = type === 'status' ? 'PRINTRA_EXTENSION_STATUS' : 'PRINTRA_EXTENSION_INGEST';
    const statusPayload = type === 'status'
      ? {
          browser: payload.browser,
          pageType: currentPage,
          extensionVersion: payload.extensionVersion,
          installSource: payload.installSource,
          installationId: payload.installationId,
          listingUrl: payload.listingUrl,
          shopUrl: payload.storeUrl
        }
      : payload;

    return chrome.runtime.sendMessage({ type: messageType, payload: statusPayload });
  }

  function addPanel() {
    if (document.getElementById('printra-extension-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'printra-extension-panel';
    panel.style.position = 'fixed';
    panel.style.right = '16px';
    panel.style.bottom = '16px';
    panel.style.zIndex = '999999';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.gap = '8px';
    panel.style.padding = '12px';
    panel.style.borderRadius = '16px';
    panel.style.background = 'rgba(17,24,39,0.95)';
    panel.style.color = 'white';
    panel.style.boxShadow = '0 12px 40px rgba(0,0,0,0.35)';
    panel.style.fontFamily = 'Arial, sans-serif';
    panel.innerHTML = `
      <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.7;">Printra</div>
      <button id="printra-analyze-page" style="padding:10px 12px;border-radius:12px;border:1px solid rgba(125,211,252,.35);background:rgba(14,165,233,.15);color:#e0f2fe;cursor:pointer;">Analyze this Etsy page</button>
      <button id="printra-sync-status" style="padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:white;cursor:pointer;">Sync extension status</button>
      <div id="printra-feedback" style="font-size:12px;line-height:1.5;color:#cbd5e1;">Ready</div>
    `;
    document.body.appendChild(panel);
    const feedback = panel.querySelector('#printra-feedback');
    panel.querySelector('#printra-analyze-page')?.addEventListener('click', async () => {
      feedback.textContent = 'Sending page data to Automatic Analysis…';
      const result = await send('ingest');
      feedback.textContent = result?.ok ? 'Analysis sent successfully.' : `Error: ${result?.error || 'unknown'}`;
    });
    panel.querySelector('#printra-sync-status')?.addEventListener('click', async () => {
      feedback.textContent = 'Syncing extension status…';
      const result = await send('status');
      feedback.textContent = result?.ok ? 'Extension status synced.' : `Error: ${result?.error || 'unknown'}`;
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'PRINTRA_TRIGGER_STATUS') {
      send('status').then((result) => sendResponse(result)).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message?.type === 'PRINTRA_TRIGGER_ANALYZE') {
      send('ingest').then((result) => sendResponse(result)).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    return false;
  });

  send('status').catch(() => null);
  addPanel();
})();
