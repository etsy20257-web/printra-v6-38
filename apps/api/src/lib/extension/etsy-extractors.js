function firstValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function collectText(values = []) {
  return values
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim())
    .join('\n');
}

function extractKeywords(title = '', description = '', tags = []) {
  const raw = [title, description, ...(Array.isArray(tags) ? tags : [])]
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);

  const stopwords = new Set(['with', 'from', 'this', 'that', 'your', 'gift', 'etsy', 'shop', 'sale', 'for', 'and', 'the']);
  const counts = new Map();
  for (const part of raw) {
    if (stopwords.has(part)) continue;
    counts.set(part, (counts.get(part) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([keyword]) => keyword).join(', ');
}

export function buildAutomaticAnalysisPayloadFromExtension(input = {}) {
  const listing = input.listing ?? {};
  const shop = input.shop ?? {};
  const listingTitle = firstValue(listing.title, input.title);
  const listingDescription = collectText([
    listing.description,
    ...(Array.isArray(listing.highlights) ? listing.highlights : [])
  ]);
  const shopText = collectText([
    shop.announcement,
    shop.about,
    ...(Array.isArray(shop.highlights) ? shop.highlights : []),
    shop.sales,
    shop.admirers,
    shop.rating
  ]);

  return {
    mode: 'manual',
    listingUrl: firstValue(listing.url, input.listingUrl),
    storeUrl: firstValue(shop.url, input.storeUrl),
    manualTitle: listingTitle,
    manualPrice: firstValue(listing.price, listing.priceText),
    manualDescription: listingDescription,
    manualKeywords: extractKeywords(listingTitle, listingDescription, listing.tags),
    manualRating: firstValue(listing.rating, shop.rating),
    manualReviewCount: firstValue(listing.reviewCount, shop.reviewCount),
    manualSalesCount: firstValue(listing.salesCount, shop.salesCount),
    manualImageCount: firstValue(listing.imageCount),
    manualVariationCount: firstValue(listing.variationCount),
    manualProductCount: firstValue(shop.productCount)
  };
}
