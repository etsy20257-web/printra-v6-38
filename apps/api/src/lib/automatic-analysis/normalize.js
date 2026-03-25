const STOP_WORDS = new Set([
  'a','an','the','for','and','with','from','that','this','into','your','you','our','their','are','is','of','to','in','on','by','or','at','as','it','its','be','can','will','my','me','we','us','do','does','did','very','really','best','top','new','made','stand','out','fast','ready','version','final','product','item','items','shop','store','listing','gift','digital','download','instant','printable','file','files','etsy','seller','platform','ref','active','home','key'
]);

const PRODUCT_WORDS = new Set(['shirt','tshirt','tee','hoodie','sweatshirt','mug','poster','print','wall','art','sign','pillow','blanket','sticker','png','svg','printable','digital','bundle','template']);
const SEASON_WORDS = new Set(['easter','christmas','halloween','birthday','wedding','mother','mothers','father','fathers','valentine','spring','summer','baby']);
const AUDIENCE_WORDS = new Set(['mom','dad','kids','kid','baby','family','women','woman','men','man','girls','girl','boys','boy','teacher','friend','friends']);

export function normalizeWhitespace(value) {
  return String(value ?? '')
    .replace(/\r/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function cleanText(value) {
  return normalizeWhitespace(value)
    .replace(/[^\p{L}\p{N}\s.,&'!?:/%$+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(value) {
  return cleanText(value)
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .map((token) => token === 'tshirt' || token === 'tee' ? 'shirt' : token)
    .map((token) => token === 'printable' || token === 'png' || token === 'svg' ? 'digital' : token)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item ?? '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function countMatches(value, regex) {
  const matches = String(value ?? '').match(regex);
  return matches ? matches.length : 0;
}

export function parseFirstPrice(value) {
  const match = String(value ?? '').match(/(?:\$|€|£)?\s?(\d{1,4}(?:[.,]\d{1,2})?)/);
  if (!match) return null;
  const amount = Number.parseFloat(match[1].replace(',', '.'));
  return Number.isFinite(amount) ? amount : null;
}

export function parseRating(value) {
  const match = String(value ?? '').match(/(\d(?:[.,]\d)?)\s*(?:out of 5|\/5|stars?)/i);
  if (!match) return null;
  const amount = Number.parseFloat(match[1].replace(',', '.'));
  return Number.isFinite(amount) ? amount : null;
}

export function parseReviewCount(value) {
  const match = String(value ?? '').match(/(\d[\d.,]*)\s*(?:reviews?|ratings?)/i);
  if (!match) return null;
  const amount = Number.parseInt(match[1].replace(/[^\d]/g, ''), 10);
  return Number.isFinite(amount) ? amount : null;
}

export function parseSalesCount(value) {
  const match = String(value ?? '').match(/(\d[\d.,]*)\s*(?:sales|sold)/i);
  if (!match) return null;
  const amount = Number.parseInt(match[1].replace(/[^\d]/g, ''), 10);
  return Number.isFinite(amount) ? amount : null;
}

export function keywordFrequency(tokens) {
  const map = new Map();
  for (const token of tokens) {
    map.set(token, (map.get(token) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export function extractKeywordClusters(tokens, limit = 8) {
  const ranked = keywordFrequency(tokens)
    .filter(([token]) => token.length > 2 && /[a-z]/i.test(token) && !/^\d/.test(token))
    .slice(0, limit)
    .map(([token, count]) => ({ keyword: token, count, intent: classifyKeyword(token) }));
  return ranked;
}

export function classifyKeyword(token) {
  if (PRODUCT_WORDS.has(token)) return 'product';
  if (SEASON_WORDS.has(token)) return 'season';
  if (AUDIENCE_WORDS.has(token)) return 'audience';
  if (/custom|personalized|name/.test(token)) return 'customization';
  return 'descriptive';
}

export function detectSignals(tokens) {
  return {
    hasCustomization: tokens.some((token) => /custom|personalized|name/.test(token)),
    hasSeasonality: tokens.some((token) => SEASON_WORDS.has(token)),
    hasAudienceFocus: tokens.some((token) => AUDIENCE_WORDS.has(token)),
    hasProductClarity: tokens.some((token) => PRODUCT_WORDS.has(token))
  };
}

export function firstMeaningfulLine(value) {
  const lines = String(value ?? '').split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return lines[0] ?? '';
}

export function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}
