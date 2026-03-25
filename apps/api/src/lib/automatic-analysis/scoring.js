import { clamp } from './normalize.js';

export function buildScores(metrics) {
  const titleLength = metrics.title.length;
  const descriptionLength = metrics.description.length;
  const keywordCount = metrics.keywords.length;
  const rating = metrics.rating ?? 0;
  const reviews = metrics.reviewCount ?? 0;
  const sales = metrics.salesCount ?? 0;
  const price = metrics.price ?? 0;

  const listingStrength = clamp(
    (titleLength >= 55 && titleLength <= 140 ? 24 : 10) +
    (descriptionLength >= 220 ? 18 : 8) +
    Math.min(keywordCount, 13) * 2 +
    (metrics.signals.hasProductClarity ? 12 : 0) +
    (metrics.signals.hasAudienceFocus ? 8 : 0) +
    (metrics.signals.hasCustomization ? 8 : 0) +
    (metrics.imageCount >= 5 ? 10 : metrics.imageCount >= 2 ? 6 : 2) +
    (metrics.variationCount >= 2 ? 6 : 2)
  );

  const storeStrength = clamp(
    (rating >= 4.8 ? 34 : rating >= 4.5 ? 24 : rating >= 4 ? 16 : 8) +
    (reviews >= 1000 ? 26 : reviews >= 250 ? 18 : reviews >= 50 ? 10 : 4) +
    (sales >= 1000 ? 24 : sales >= 250 ? 16 : sales >= 50 ? 10 : 4) +
    (metrics.storeAgeSignal >= 2 ? 8 : 4) +
    (metrics.catalogDepthSignal >= 2 ? 8 : 4)
  );

  const keywordStrength = clamp(
    Math.min(keywordCount, 13) * 4 +
    Math.min(metrics.keywordClusters.length, 8) * 4 +
    (metrics.signals.hasSeasonality ? 8 : 0) +
    (metrics.keywordOverlapScore ?? 0)
  );

  const trustScore = clamp(
    (rating >= 4.8 ? 28 : rating >= 4.5 ? 22 : rating >= 4 ? 14 : 8) +
    (reviews >= 500 ? 24 : reviews >= 100 ? 16 : reviews >= 20 ? 10 : 4) +
    (sales >= 500 ? 22 : sales >= 100 ? 14 : sales >= 20 ? 8 : 3) +
    (metrics.hasPolicySignals ? 12 : 0) +
    (metrics.hasDeliverySignals ? 8 : 0)
  );

  const competitionDifficulty = clamp(
    Math.round((listingStrength * 0.3) + (storeStrength * 0.4) + (keywordStrength * 0.2) + (trustScore * 0.1))
  );

  const opportunityScore = clamp(
    100 - competitionDifficulty +
    (price > 0 && price < 25 ? 8 : 0) +
    (keywordCount < 13 ? 6 : 0) +
    (metrics.signals.hasCustomization ? 6 : 0)
  );

  const conversionQuality = clamp(
    Math.round((listingStrength * 0.45) + (trustScore * 0.25) + (keywordStrength * 0.15) + (storeStrength * 0.15))
  );

  const demandHeat = clamp(
    (sales >= 1000 ? 34 : sales >= 250 ? 24 : sales >= 50 ? 16 : 6) +
    (reviews >= 500 ? 26 : reviews >= 100 ? 18 : reviews >= 20 ? 10 : 4) +
    (metrics.signals.hasSeasonality ? 10 : 4) +
    (metrics.signals.hasAudienceFocus ? 8 : 4) +
    (keywordStrength * 0.18)
  );

  const estimatedSalesSignal = clamp(
    sales > 0
      ? Math.min(100, Math.round(Math.log10(sales + 1) * 28))
      : Math.round(Math.min(100, (reviews * 0.08) + (rating * 10) + (demandHeat * 0.25)))
  );

  return {
    listingStrength,
    storeStrength,
    keywordStrength,
    trustScore,
    competitionDifficulty,
    opportunityScore,
    conversionQuality,
    demandHeat,
    estimatedSalesSignal
  };
}

export function buildRiskFlags(metrics, scores) {
  const flags = [];
  if (metrics.title.length < 55) flags.push('Title is short and may miss high-intent search coverage.');
  if (metrics.description.length < 220) flags.push('Description depth is low and trust-building content is limited.');
  if (metrics.keywords.length < 10) flags.push('Keyword spread is thin compared with a strong Etsy-ready listing.');
  if ((metrics.rating ?? 0) > 0 && (metrics.rating ?? 0) < 4.5) flags.push('Store rating signal is below strong competitor territory.');
  if ((metrics.reviewCount ?? 0) < 20) flags.push('Review depth is low, so shopper trust can be weaker.');
  if (scores.competitionDifficulty >= 70) flags.push('Competition difficulty is high, so beating this listing will need stronger positioning.');
  return flags;
}

export function buildOpportunityNotes(metrics, scores) {
  const notes = [];
  if (!metrics.signals.hasCustomization) notes.push('Customization angle is missing; adding named or personalized language may widen conversion appeal.');
  if (!metrics.signals.hasAudienceFocus) notes.push('Audience focus is weak; adding recipient language can sharpen intent.');
  if (!metrics.signals.hasSeasonality) notes.push('Seasonal or event intent is low; this can be a gap if the niche is occasion-driven.');
  if (metrics.keywordClusters.length < 5) notes.push('Keyword cluster variety is thin; long-tail clusters should be expanded.');
  if ((metrics.imageCount ?? 0) < 5) notes.push('Image count signal is modest; stronger visual proof usually helps listing confidence.');
  if (scores.opportunityScore >= 55) notes.push('There is room to beat this competitor through cleaner title structure, broader keyword capture, and stronger trust framing.');
  return notes;
}

export function buildBeatMap(scores) {
  return [
    { area: 'Pricing angle', level: scores.opportunityScore >= 60 ? 'Favorable' : scores.opportunityScore >= 40 ? 'Competitive' : 'Hard' },
    { area: 'Keyword coverage', level: scores.keywordStrength < 65 ? 'Beat-able' : 'Dense' },
    { area: 'Store trust', level: scores.trustScore < 65 ? 'Beat-able' : 'Strong' },
    { area: 'Listing conversion', level: scores.conversionQuality < 70 ? 'Beat-able' : 'Strong' }
  ];
}
