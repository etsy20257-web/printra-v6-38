import { parseCsvText } from './csv.js';
import {
  cleanText,
  clamp,
  dedupe,
  detectSignals,
  extractKeywordClusters,
  firstMeaningfulLine,
  normalizeWhitespace,
  parseFirstPrice,
  parseRating,
  parseReviewCount,
  parseSalesCount,
  safeNumber,
  tokenize
} from './normalize.js';
import { buildBeatMap, buildOpportunityNotes, buildRiskFlags, buildScores } from './scoring.js';

function inferPlatform(url, fallback = 'manual') {
  const value = String(url ?? '').toLowerCase();
  if (value.includes('etsy.com')) return 'etsy';
  if (value.includes('amazon.')) return 'amazon';
  if (value.includes('ebay.')) return 'ebay';
  if (value.includes('shopify')) return 'shopify';
  return fallback;
}

function inferSourceType(url, fallback = 'manual') {
  const value = String(url ?? '').toLowerCase();
  if (/shop|store/.test(value)) return 'store';
  if (value) return 'listing';
  return fallback;
}

function titleFromInput({ title, listingText, sourceUrl }) {
  if (title) return cleanText(title);
  const firstLine = firstMeaningfulLine(listingText);
  if (firstLine) return cleanText(firstLine);
  if (sourceUrl) return cleanText(sourceUrl.split('/').filter(Boolean).pop() ?? 'Competitor Listing');
  return 'Competitor Listing';
}

function parseImageCount(value) {
  const match = String(value ?? '').match(/(\d{1,2})\s*(?:images?|photos?)/i);
  if (!match) return 0;
  return safeNumber(match[1], 0);
}

function parseVariationCount(value) {
  const match = String(value ?? '').match(/(\d{1,2})\s*(?:variations?|options?)/i);
  if (!match) return 0;
  return safeNumber(match[1], 0);
}

function deriveCatalogDepth(productCount) {
  if (productCount >= 200) return 3;
  if (productCount >= 60) return 2;
  if (productCount >= 10) return 1;
  return 0;
}

function deriveStoreAgeSignal(text) {
  const lower = String(text ?? '').toLowerCase();
  if (/since 20(1\d|2[0-6])/.test(lower)) return 3;
  if (/since 20\d\d/.test(lower)) return 2;
  if (/opened|founded|established/.test(lower)) return 1;
  return 0;
}

function parseProductCount(value) {
  const match = String(value ?? '').match(/(\d[\d.,]*)\s*(?:items?|products?|listings?)/i);
  if (!match) return 0;
  return safeNumber(match[1].replace(/[^\d]/g, ''), 0);
}

function normalizeKeywordInput(value) {
  return dedupe(String(value ?? '')
    .split(/[,\n]/)
    .map((part) => cleanText(part).toLowerCase())
    .filter(Boolean));
}

function analyzeSingle({
  listingUrl,
  storeUrl,
  listingText,
  storeText,
  manualTitle,
  manualPrice,
  manualDescription,
  manualKeywords,
  manualRating,
  manualReviewCount,
  manualSalesCount,
  manualImageCount,
  manualVariationCount,
  manualProductCount,
  platformHint,
  sourceHint
}) {
  const normalizedListingText = normalizeWhitespace(listingText || manualDescription || '');
  const normalizedStoreText = normalizeWhitespace(storeText || '');
  const title = titleFromInput({ title: manualTitle, listingText: normalizedListingText, sourceUrl: listingUrl });
  const description = cleanText(manualDescription || normalizedListingText);
  const mergedText = `${title}\n${description}\n${normalizedStoreText}`.trim();
  const tokens = tokenize(mergedText);
  const keywordClusters = extractKeywordClusters(tokens, 10);
  const keywordList = dedupe([
    ...normalizeKeywordInput(manualKeywords),
    ...keywordClusters.map((entry) => entry.keyword)
  ]).filter((entry) => /[a-z]/i.test(entry) && !/^\d/.test(entry)).slice(0, 13);
  const signals = detectSignals(tokens);

  const price = safeNumber(manualPrice, parseFirstPrice(normalizedListingText));
  const rating = safeNumber(manualRating, parseRating(`${normalizedListingText}\n${normalizedStoreText}`));
  const reviewCount = safeNumber(manualReviewCount, parseReviewCount(`${normalizedListingText}\n${normalizedStoreText}`));
  const salesCount = safeNumber(manualSalesCount, parseSalesCount(`${normalizedListingText}\n${normalizedStoreText}`));
  const imageCount = safeNumber(manualImageCount, parseImageCount(normalizedListingText));
  const variationCount = safeNumber(manualVariationCount, parseVariationCount(normalizedListingText));
  const productCount = safeNumber(manualProductCount, parseProductCount(normalizedStoreText));
  const storeAgeSignal = deriveStoreAgeSignal(normalizedStoreText);
  const catalogDepthSignal = deriveCatalogDepth(productCount);
  const hasPolicySignals = /returns|policy|shipping|dispatch|processing/i.test(`${normalizedListingText}\n${normalizedStoreText}`);
  const hasDeliverySignals = /delivery|dispatch|ships|estimated arrival|processing time/i.test(`${normalizedListingText}\n${normalizedStoreText}`);
  const keywordOverlapScore = clamp(keywordList.length * 3 + (signals.hasAudienceFocus ? 6 : 0) + (signals.hasSeasonality ? 6 : 0));

  const metrics = {
    platform: inferPlatform(listingUrl || storeUrl, platformHint || 'manual'),
    listingUrl,
    storeUrl,
    sourceType: inferSourceType(listingUrl || storeUrl, sourceHint || 'manual'),
    title,
    description,
    keywords: keywordList,
    keywordClusters,
    signals,
    price: price || null,
    rating: rating || null,
    reviewCount: reviewCount || 0,
    salesCount: salesCount || 0,
    imageCount,
    variationCount,
    productCount,
    storeAgeSignal,
    catalogDepthSignal,
    hasPolicySignals,
    hasDeliverySignals,
    keywordOverlapScore
  };

  const scores = buildScores(metrics);
  const riskFlags = buildRiskFlags(metrics, scores);
  const opportunityNotes = buildOpportunityNotes(metrics, scores);
  const observed = {
    price: metrics.price,
    rating: metrics.rating,
    reviewCount: metrics.reviewCount,
    salesCount: metrics.salesCount,
    imageCount: metrics.imageCount,
    variationCount: metrics.variationCount,
    productCount: metrics.productCount
  };
  const estimated = {
    demandHeat: scores.demandHeat,
    estimatedSalesSignal: scores.estimatedSalesSignal,
    storeMaturitySignal: metrics.storeAgeSignal,
    catalogDepthSignal: metrics.catalogDepthSignal
  };

  return {
    overview: {
      platform: metrics.platform,
      sourceType: metrics.sourceType,
      listingUrl: listingUrl || null,
      storeUrl: storeUrl || null,
      title: metrics.title
    },
    observed,
    estimated,
    scored: scores,
    keywordClusters,
    keywords: keywordList,
    riskFlags,
    opportunityNotes,
    beatMap: buildBeatMap(scores)
  };
}

function aggregateRows(results) {
  const count = results.length;
  if (!count) {
    return {
      count: 0,
      averageScores: null,
      strongestKeyword: null,
      averagePrice: null,
      averageRating: null
    };
  }

  const average = (selector) => Number((results.reduce((sum, item) => sum + selector(item), 0) / count).toFixed(1));
  const keywordCounter = new Map();
  for (const result of results) {
    for (const keyword of result.keywords) {
      keywordCounter.set(keyword, (keywordCounter.get(keyword) ?? 0) + 1);
    }
  }
  const strongestKeyword = [...keywordCounter.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    count,
    averageScores: {
      listingStrength: average((item) => item.scored.listingStrength),
      storeStrength: average((item) => item.scored.storeStrength),
      keywordStrength: average((item) => item.scored.keywordStrength),
      trustScore: average((item) => item.scored.trustScore),
      competitionDifficulty: average((item) => item.scored.competitionDifficulty),
      opportunityScore: average((item) => item.scored.opportunityScore),
      conversionQuality: average((item) => item.scored.conversionQuality),
      demandHeat: average((item) => item.scored.demandHeat),
      estimatedSalesSignal: average((item) => item.scored.estimatedSalesSignal)
    },
    strongestKeyword,
    averagePrice: average((item) => item.observed.price ?? 0),
    averageRating: average((item) => item.observed.rating ?? 0)
  };
}

export function runAutomaticAnalysis(payload) {
  const mode = String(payload?.mode ?? 'paste');

  if (mode === 'csv') {
    const rows = parseCsvText(payload.csvText ?? '');
    const results = rows.slice(0, 24).map((row) => analyzeSingle({
      listingUrl: row.listing_url || '',
      storeUrl: row.store_url || '',
      listingText: row.listing_text || row.content || row.description || '',
      storeText: row.store_text || '',
      manualTitle: row.title || '',
      manualPrice: row.price || '',
      manualDescription: row.description || row.listing_text || '',
      manualKeywords: row.keywords || '',
      manualRating: row.rating || '',
      manualReviewCount: row.reviews || '',
      manualSalesCount: row.sales || '',
      manualImageCount: row.images || '',
      manualVariationCount: row.variations || '',
      manualProductCount: row.products || '',
      platformHint: row.platform || 'csv',
      sourceHint: row.__source || 'csv'
    }));

    return {
      mode,
      summary: aggregateRows(results),
      result: results[0] ?? null,
      rows: results,
      primaryRow: results[0] ?? null
    };
  }

  const result = analyzeSingle({
    listingUrl: payload.listingUrl,
    storeUrl: payload.storeUrl,
    listingText: payload.listingText,
    storeText: payload.storeText,
    manualTitle: payload.manualTitle,
    manualPrice: payload.manualPrice,
    manualDescription: payload.manualDescription,
    manualKeywords: payload.manualKeywords,
    manualRating: payload.manualRating,
    manualReviewCount: payload.manualReviewCount,
    manualSalesCount: payload.manualSalesCount,
    manualImageCount: payload.manualImageCount,
    manualVariationCount: payload.manualVariationCount,
    manualProductCount: payload.manualProductCount,
    platformHint: mode === 'manual' ? 'manual' : mode === 'paste' ? 'paste' : 'url',
    sourceHint: mode === 'manual' ? 'manual' : mode === 'paste' ? 'paste' : 'url'
  });

  return {
    mode,
    summary: aggregateRows([result]),
    result
  };
}
