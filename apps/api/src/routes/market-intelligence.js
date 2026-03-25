import { Router } from 'express';

export const marketIntelligenceRouter = Router();

const STOP_WORDS = new Set([
  'a','an','the','for','and','with','from','that','this','into','your','you','our','their','are','is','of','to','in','on','by','or','at','as','it','its','be','can','will','my','me','we','us','do','does','did','very','really','best','top','new','made','stand','out','fast','ready','version','final'
]);

const PRODUCT_WORDS = new Set(['shirt','tshirt','tee','hoodie','sweatshirt','mug','poster','print','wall','art','sign','pillow','blanket','sticker','png','svg','printable','digital','bundle']);
const OCCASION_WORDS = new Set(['easter','christmas','halloween','birthday','wedding','mother','mothers','father','fathers','valentine','spring','summer','baby']);
const AUDIENCE_WORDS = new Set(['mom','dad','kids','kid','baby','family','women','woman','men','man','girls','girl','boys','boy','teacher','friend','friends']);
const RISKY_KEYWORDS = new Set(['buyer','idea','intent','cheap','best','search']);
const META_TERMS = new Set(['seo','geo','aeo','algorithm','algoritma','algoritmasi','algoritmas','rev','etsy','ebay','amazon','marketplace','prompt']);
const SYNTHETIC_PATTERNS = [/clear search intent/i, /strong first impression/i, /search language/i, /built for/i, /use the final version/i, /ready starting point/i, /product-first impression/i, /made to feel personal/i, /finish the final copy/i, /the opening should/i, /keep the wording/i, /use the final copy/i, /it should feel/i];


function sanitizeApiKey(value) {
  return String(value ?? '')
    .replace(/["'`]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function sanitizeOptionalHeader(value) {
  return String(value ?? '').replace(/["'`]/g, '').trim();
}
function normalizeWhitespace(value) {
  return String(value ?? '')
    .replace(/[|/]+/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeModelName(value) {
  return String(value ?? '')
    .replace(/["'`]/g, '')
    .trim();
}

function cleanText(value) {
  return normalizeWhitespace(value)
    .replace(/[^a-zA-Z0-9\s,&']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value) {
  return cleanText(value)
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function tokenize(value) {
  return cleanText(value)
    .toLowerCase()
    .split(' ')
    .map((token) => token.trim())
    .map((token) => token === 'tshirt' || token === 'tee' ? 'shirt' : token)
    .map((token) => token === 'printable' || token === 'digital' ? 'digital' : token)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token) && !META_TERMS.has(token));
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


function escapeRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWholeWord(text, token) {
  if (!token) return false;
  return new RegExp(`\b${escapeRegex(token)}\b`, 'i').test(String(text ?? ''));
}

function limitText(value, max) {
  if (value.length <= max) return value.trim();
  const sliced = value.slice(0, max + 1);
  const safe = sliced.lastIndexOf(' ');
  return (safe > 20 ? sliced.slice(0, safe) : value.slice(0, max)).trim().replace(/[,.;:]+$/, '');
}

function uniqueWords(value) {
  const parts = cleanText(value).split(' ').filter(Boolean);
  const seen = new Set();
  const output = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(part);
  }
  return output.join(' ');
}

function smartLimitKeyword(value, max = 20) {
  const clean = cleanText(value).toLowerCase();
  if (!clean) return '';
  if (clean.length <= max) return clean;
  const words = clean.split(' ').filter(Boolean);
  let result = '';
  for (const word of words) {
    const candidate = result ? `${result} ${word}` : word;
    if (candidate.length > max) break;
    result = candidate;
  }
  return result || limitText(clean, max).toLowerCase();
}

function containsSameRoot(text, token) {
  return new RegExp(`\b${token}\b`, 'i').test(text);
}

function buildAudiencePhrase(ctx) {
  if (!ctx.audience) return '';
  if (ctx.audience === 'family') return 'Family Gift';
  if (ctx.audience === 'mom') return 'Gift for Mom';
  if (ctx.audience === 'dad') return 'Gift for Dad';
  if (ctx.audience === 'kids' || ctx.audience === 'kid') return 'Kids Gift';
  return `${titleCase(ctx.audience)} Gift`;
}

function buildOccasionPhrase(ctx) {
  if (!ctx.occasion) return '';
  if (ctx.occasion === 'easter') return 'Spring Holiday';
  if (ctx.occasion === 'christmas') return 'Holiday Gift';
  return `${titleCase(ctx.occasion)} Gift`;
}

function detectContext(tokens) {
  let product = tokens.find((token) => PRODUCT_WORDS.has(token)) ?? 'item';
  if (product === 'tshirt' || product === 'tee') product = 'shirt';
  if ((tokens.includes('printable') || tokens.includes('digital') || tokens.includes('png') || tokens.includes('svg')) && !tokens.includes('shirt') && !tokens.includes('mug')) product = 'digital';
  const occasion = tokens.find((token) => OCCASION_WORDS.has(token)) ?? '';
  const audience = tokens.find((token) => AUDIENCE_WORDS.has(token)) ?? '';
  const hasCustom = tokens.includes('custom') || tokens.includes('personalized') || tokens.includes('personalised');
  const digital = tokens.includes('png') || tokens.includes('svg') || tokens.includes('digital') || tokens.includes('printable');
  return { product, occasion, audience, hasCustom, digital };
}

function coreTokens(tokens) {
  return dedupe(tokens.filter((token) => !RISKY_KEYWORDS.has(token))).slice(0, 6);
}

function buildPrimaryPhrase(tokens, ctx) {
  const base = coreTokens(tokens).filter((token) => token !== 'gift');
  const primary = base.slice(0, Math.min(4, base.length));
  if (!primary.length) {
    return ctx.product === 'item' ? 'Custom Gift' : titleCase(ctx.product);
  }
  return titleCase(primary.join(' '));
}

function productDescriptor(ctx) {
  if (ctx.product === 'shirt') return 'Shirt';
  if (ctx.product === 'hoodie') return 'Hoodie';
  if (ctx.product === 'sweatshirt') return 'Sweatshirt';
  if (ctx.product === 'mug') return 'Mug';
  if (ctx.product === 'digital' || ctx.product === 'png' || ctx.product === 'svg' || ctx.digital) return 'Printable Bundle';
  if (ctx.product === 'print') return 'Print';
  return titleCase(ctx.product);
}

function buildRuleTitle(input, tokens) {
  const ctx = detectContext(tokens);
  const primary = buildPrimaryPhrase(tokens, ctx)
    .replace(/\bTshirt\b/gi, 'Shirt')
    .replace(/\bPrintable Printable\b/gi, 'Printable');
  const descriptor = productDescriptor(ctx);
  const titleHasDescriptor = containsSameRoot(primary, descriptor.toLowerCase()) || (descriptor.toLowerCase() === 'shirt' && /\btee\b/i.test(primary));
  const components = [primary];

  if (ctx.hasCustom && !containsSameRoot(primary, 'custom') && !containsSameRoot(primary, 'personalized')) {
    components.push('Personalized');
  }
  if (!titleHasDescriptor) components.push(descriptor);

  const audiencePhrase = buildAudiencePhrase(ctx);
  const occasionPhrase = buildOccasionPhrase(ctx);
  if (audiencePhrase) components.push(audiencePhrase);
  if (occasionPhrase && !containsSameRoot(components.join(' '), occasionPhrase.toLowerCase().split(' ')[0])) components.push(occasionPhrase);

  let title = uniqueWords(dedupe(components).join(' '));
  const extras = dedupe([
    ctx.product === 'shirt' && ctx.audience === 'family' ? 'Matching Holiday Tee' : '',
    ctx.product === 'shirt' && ctx.occasion === 'easter' ? 'Spring Gatherings' : '',
    ctx.product === 'shirt' && ctx.hasCustom ? 'Custom Family Gift' : '',
    ctx.product === 'shirt' && !ctx.hasCustom ? 'Soft Unisex Fit' : '',
    ctx.digital ? 'Instant Download' : ''
  ].filter(Boolean));

  for (const extra of extras) {
    const candidate = `${title}, ${extra}`;
    if (candidate.length <= 140 && repeatedPhrasePenalty(candidate) === 0) title = candidate;
  }

  title = title
    .replace(/\bFamily Gift, Family Gift\b/i, 'Family Gift')
    .replace(/\bGift Gift\b/i, 'Gift')
    .replace(/\bShirt Shirt\b/i, 'Shirt')
    .replace(/\bTee Shirt\b/i, 'Tee')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ', ')
    .trim();

  if (title.length < 58) {
    const refinedInput = titleCase(limitText(cleanText(input), 42));
    if (refinedInput && !new RegExp(escapeRegex(refinedInput), 'i').test(title)) {
      const candidate = `${title}, ${refinedInput}`;
      if (candidate.length <= 140) title = candidate;
    }
  }

  title = titleCase(limitText(uniqueWords(title), 140));
  if (repeatedPhrasePenalty(title) > 8) {
    title = titleCase(limitText(`${primary} ${titleHasDescriptor ? '' : descriptor} ${audiencePhrase || occasionPhrase || 'Gift'}`, 140));
  }
  return title.replace(/\s+/g, ' ').trim();
}

function buildRuleDescription(title, tokens) {
  const ctx = detectContext(tokens);
  const descriptor = productDescriptor(ctx).toLowerCase();
  const shortLead = limitText(title.split(',')[0], 72);
  const audienceText = ctx.audience ? ` for ${ctx.audience}` : ' for thoughtful gifting';
  const occasionText = ctx.occasion ? ` during ${ctx.occasion}` : '';
  const personalization = ctx.hasCustom
    ? 'Add a name, short phrase, or family detail to create a more personal keepsake that feels ready to gift.'
    : 'The design is written to feel warm, easy to read, and simple to enjoy without looking overdone.';
  const featureText = ctx.product === 'shirt'
    ? 'The soft unisex fit works well for family photos, holiday gatherings, casual spring plans, and comfortable everyday wear.'
    : ctx.digital
      ? 'The digital files are easy to download, save, and use for printing or display at home or as a meaningful gift.'
      : `It is designed to feel useful, easy to gift, and simple to enjoy in everyday use.`;
  const detailText = ctx.product === 'shirt'
    ? 'You can tailor the final listing with fabric, fit, sizing, and care details so shoppers know exactly what to expect before ordering.'
    : ctx.digital
      ? 'You can tailor the final listing with file types, delivery format, and printing details so shoppers know exactly what is included.'
      : `You can tailor the final listing with material, size, and daily-use details so shoppers know exactly what the ${descriptor} includes.`;

  return [
    `${shortLead} brings a cheerful seasonal look${audienceText}${occasionText}.`,
    personalization,
    featureText,
    detailText
  ].join(' ');
}

function sanitizeKeyword(value) {
  const clean = cleanText(value).toLowerCase();
  if (!clean) return '';
  return smartLimitKeyword(clean, 20);
}

function buildRuleKeywords(tokens, title) {
  const ctx = detectContext(tokens);
  const descriptor = ctx.product === 'shirt' ? 'shirt' : ctx.digital ? 'printable' : productDescriptor(ctx).toLowerCase().split(' ')[0];
  const occasionWord = ctx.occasion || 'holiday';
  const audienceWord = ctx.audience || 'family';

  const preferred = dedupe([
    ctx.occasion === 'easter' && ctx.product === 'shirt' ? 'easter family shirt' : '',
    ctx.occasion === 'easter' && ctx.product === 'shirt' ? 'spring holiday tee' : '',
    ctx.product === 'shirt' ? 'soft unisex shirt' : '',
    ctx.product === 'shirt' ? 'family gathering tee' : '',
    ctx.product === 'shirt' && ctx.hasCustom ? 'custom family shirt' : '',
    ctx.product === 'shirt' && ctx.hasCustom ? 'personalized tee' : '',
    ctx.occasion === 'easter' ? 'easter gift shirt' : '',
    ctx.occasion === 'easter' ? 'easter celebration' : '',
    ctx.occasion === 'easter' && ctx.audience === 'family' ? 'matching family tee' : '',
    ctx.occasion === 'easter' ? 'easter outfit shirt' : '',
    ctx.occasion === 'easter' ? 'bunny family shirt' : '',
    ctx.product === 'shirt' ? 'comfortable tee' : '',
    ctx.product === 'shirt' ? 'festive family top' : '',
    `${occasionWord} ${audienceWord} ${descriptor}`,
    `${audienceWord} ${descriptor}`,
    `${occasionWord} gift`,
    title.split(',')[0].split(' ').slice(0, 3).join(' ')
  ].map(sanitizeKeyword).filter(Boolean));

  const selected = [];
  const roots = new Set();
  for (const phrase of preferred) {
    const words = phrase.split(' ').filter(Boolean);
    if (words.length < 2) continue;
    if (phrase.length > 20) continue;
    if (words.some((w) => META_TERMS.has(w) || RISKY_KEYWORDS.has(w))) continue;
    const root = words.slice(0, 2).join(' ');
    if (roots.has(root)) continue;
    selected.push(phrase);
    roots.add(root);
    if (selected.length === 13) break;
  }

  const fallbackPool = dedupe([
    ctx.product === 'shirt' ? 'soft cotton tee' : '',
    ctx.product === 'shirt' ? 'spring family shirt' : '',
    ctx.product === 'shirt' ? 'holiday gift shirt' : '',
    ctx.product === 'shirt' ? 'family photo tee' : '',
    ctx.digital ? 'printable gift' : '',
    `${occasionWord} ${descriptor}`,
    `${audienceWord} gift idea`
  ].map(sanitizeKeyword).filter(Boolean));

  for (const item of fallbackPool) {
    if (selected.length === 13) break;
    const root = item.split(' ').slice(0,2).join(' ');
    if (!selected.includes(item) && !roots.has(root) && item.split(' ').length >= 2) {
      selected.push(item);
      roots.add(root);
    }
  }

  return selected.slice(0, 13);
}

function repeatedPhrasePenalty(text) {
  const parts = cleanText(text).toLowerCase().split(' ').filter(Boolean);
  let penalty = 0;
  const bigrams = {};
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = `${parts[i]} ${parts[i + 1]}`;
    bigrams[key] = (bigrams[key] ?? 0) + 1;
  }
  for (const count of Object.values(bigrams)) {
    if (count > 1) penalty += (count - 1) * 8;
  }
  return penalty;
}

function syntheticLanguagePenalty(text) {
  let penalty = 0;
  for (const pattern of SYNTHETIC_PATTERNS) {
    if (pattern.test(text)) penalty += 10;
  }
  return penalty;
}

function keywordQualityPenalty(keywords) {
  let penalty = 0;
  const seenRoots = new Set();
  for (const keyword of keywords) {
    if (keyword.length > 20) penalty += 8;
    if (keyword.split(' ').length < 2) penalty += 5;
    if ([...RISKY_KEYWORDS].some((risky) => keyword.includes(risky))) penalty += 7;
    const root = keyword.split(' ').slice(0, 2).join(' ');
    if (seenRoots.has(root)) penalty += 3;
    seenRoots.add(root);
  }
  return penalty;
}

function computeSeoScore(title, keywords) {
  let score = 72;
  const firstForty = title.slice(0, 40);
  if (title.length < 65) score -= 10;
  if (title.length > 140) score -= 20;
  if (firstForty.split(' ').length < 4) score -= 10;
  score -= repeatedPhrasePenalty(title);
  const titleTokens = tokenize(title);
  const keywordHits = keywords.filter((keyword) => {
    const first = keyword.split(' ')[0];
    return titleTokens.includes(first);
  }).length;
  if (keywordHits < 6) score -= 14;
  if (keywords.length !== 13) score -= 10;
  score -= keywordQualityPenalty(keywords);
  return Math.max(18, Math.min(96, score));
}

function computeGeoScore(title, description, keywords) {
  let score = 70;
  const naturalTerms = new Set([...tokenize(title), ...tokenize(description)]);
  if (description.slice(0, 40).length < 30) score -= 14;
  if (/buyer|intent|idea/i.test(description)) score -= 12;
  if (/buyer|intent|idea/i.test(title)) score -= 10;
  if (description.split('.').length < 4) score -= 10;
  if (naturalTerms.size < 8) score -= 8;
  const semanticCoverage = keywords.filter((keyword) => keyword.split(' ').some((part) => naturalTerms.has(part))).length;
  if (semanticCoverage < 8) score -= 8;
  score -= syntheticLanguagePenalty(`${title} ${description}`);
  return Math.max(18, Math.min(95, score));
}

function computeAeoScore(description, title, keywords) {
  let score = 68;
  const opening = description.slice(0, 80).toLowerCase();
  if (!opening.includes(tokenize(title)[0] ?? '')) score -= 8;
  if (!/gift|custom|personal|easy|fit|detail|name|soft|perfect|great/.test(opening)) score -= 8;
  if (description.length < 260) score -= 12;
  if (description.length > 700) score -= 6;
  const keywordsInOpening = keywords.filter((keyword) => opening.includes(keyword.split(' ')[0])).length;
  if (keywordsInOpening < 3) score -= 12;
  if (/buyer|intent|idea|search language/.test(description.toLowerCase())) score -= 16;
  return Math.max(18, Math.min(94, score));
}

function computeOverallScore(seo, geo, aeo, title, description, keywords) {
  let score = Math.round(seo * 0.4 + geo * 0.3 + aeo * 0.3);
  score -= Math.round(repeatedPhrasePenalty(title) * 0.6);
  score -= Math.round(keywordQualityPenalty(keywords) * 0.6);
  score -= Math.round(syntheticLanguagePenalty(`${title} ${description}`) * 0.8);
  if (/printable/i.test(title) && !/png|svg|digital|download/i.test(description)) score -= 8;
  if (/idea|buyer|intent/i.test(`${title} ${description} ${keywords.join(' ')}`.toLowerCase())) score -= 10;
  return Math.max(22, Math.min(96, score));
}

function scoreStatus(score) {
  if (score >= 85) return 'Strong List';
  if (score >= 70) return 'Medium';
  if (score >= 55) return 'Needs Improvement';
  return 'Refresh List';
}

function buildNotes({ seo, geo, aeo, title, description, keywords, score, mode }) {
  const notes = [];
  notes.push(title.slice(0, 40).split(' ').length >= 4 ? 'First 40 characters carry a stronger search lead.' : 'First 40 characters should carry clearer search intent.');
  notes.push(description.slice(0, 40).length >= 30 ? 'Description opening is direct enough to support fast understanding.' : 'Description opening needs a faster product-led start.');
  notes.push(keywords.length === 13 && keywords.every((keyword) => keyword.length <= 20) ? 'Keyword formatting matches the current rule set.' : 'Keyword count or length still breaks the current rule set.');
  notes.push(mode === 'ai-assisted' ? 'AI wrote the listing draft and the system only scored the result.' : 'Rule-based drafting was used because no live AI configuration was detected.');
  if (seo < 60) notes.push('SEO score is being held down by repetition, weak first-line structure, or thin keyword alignment.');
  if (geo < 60) notes.push('GEO score is being held down by language that sounds too synthetic or too repetitive.');
  if (aeo < 60) notes.push('AEO score is being held down by a weak opening or low answer-style clarity.');
  if (score >= 85) notes.push('The list is in a strong publish-ready range.');
  else if (score >= 70) notes.push('The list is usable, but one more pass could sharpen it.');
  else if (score >= 55) notes.push('The list needs another optimization pass before publishing.');
  else notes.push('The list should be rebuilt before publishing.');
  return notes.slice(0, 6);
}

function extractJsonObject(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {}
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {}
  }
  return null;
}

function collectOutputText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text;
  if (!Array.isArray(payload.output)) return '';
  return payload.output
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .map((content) => content?.text ?? '')
    .join('\n')
    .trim();
}

function finalizeAiTitle(candidate, fallback) {
  const title = normalizeWhitespace(candidate || fallback).replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, '');
  return titleCase(title || fallback);
}

function finalizeAiDescription(candidate, fallback) {
  const description = normalizeWhitespace(candidate || fallback);
  return description || fallback;
}

function normalizeKeywordCandidates(candidateKeywords) {
  if (Array.isArray(candidateKeywords)) return candidateKeywords;
  return String(candidateKeywords ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function finalizeAiKeywords(candidateKeywords) {
  const normalized = dedupe(normalizeKeywordCandidates(candidateKeywords).map(sanitizeKeyword).filter(Boolean));
  return normalized.slice(0, 13);
}

async function generateWithAiIfConfigured(input, ruleDraft) {
  const apiKey = sanitizeApiKey(process.env.OPENAI_API_KEY ?? '');
  const model = normalizeModelName(process.env.OPENAI_MODEL ?? '') || 'gpt-4.1-mini';
  const projectId = sanitizeOptionalHeader(process.env.OPENAI_PROJECT_ID ?? '');
  const organizationId = sanitizeOptionalHeader(process.env.OPENAI_ORGANIZATION_ID ?? '');
  if (!apiKey) return { mode: 'rule-based', aiDraft: null };

  const prompt = [
    'You are an expert commercial copywriter who writes buyer-facing product listings.',
    'Write a fresh listing draft from the user prompt.',
    'Return only valid JSON with exactly these keys: title, description, keywords.',
    'Do not write writing advice, instructions, rules, or meta commentary.',
    'Do not echo internal optimization words from the user prompt such as SEO, GEO, AEO, algorithm, prompt, rev, or marketplace jargon unless they are truly part of the product itself.',
    'Do not mention any marketplace name unless the user explicitly asks for it.',
    'Do not write phrases like: the opening should, keep the wording, use the final copy, made to feel, built for clear search intent, or any explanation of how the text was written.',
    'The title must feel human, natural, product-led, and shopper-friendly. Keep it under 140 characters and avoid obvious keyword stuffing.',
    'The description must be buyer-facing from the first sentence, warm, specific, publish-ready, and focused on the actual product.',
    'The description must describe the product itself, its use, value, fit, feel, gifting angle, or delivery details. It must never explain how the copy was written or how the listing should be written.',
    'keywords must be an array of exactly 13 strings.',
    'Each keyword must be a complete natural phrase, 20 characters or less, and must never be cut off mid-word.',
    'Avoid repeated phrases across the title and keywords.',
    'Write as if a shopper could buy from this listing today.',
    `User prompt: ${input}`
  ].join('\n');

  try {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    };
    if (projectId) headers['OpenAI-Project'] = projectId;
    if (organizationId) headers['OpenAI-Organization'] = organizationId;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        input: prompt,
        text: { format: { type: 'text' } }
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const apiMessage = payload?.error?.message || `OpenAI request failed with ${response.status}`;
      return { mode: 'rule-based', aiDraft: null, aiError: `AI fallback: ${apiMessage}` };
    }

    const parsed = extractJsonObject(collectOutputText(payload));
    if (!parsed || typeof parsed !== 'object') {
      return { mode: 'rule-based', aiDraft: null, aiError: 'AI fallback: model response was not parseable JSON.' };
    }

    const aiTitle = typeof parsed.title === 'string' ? parsed.title : '';
    const aiDescription = typeof parsed.description === 'string' ? parsed.description : '';
    const aiKeywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];
    const combinedAiText = `${aiTitle} ${aiDescription} ${aiKeywords.join(' ')}`.toLowerCase();
    const hasInstructionLanguage = SYNTHETIC_PATTERNS.some((pattern) => pattern.test(combinedAiText));
    const hasMetaLeak = [...META_TERMS].some((term) => hasWholeWord(combinedAiText, term));

    if (hasInstructionLanguage || hasMetaLeak) {
      return { mode: 'rule-based', aiDraft: null, aiError: 'AI fallback: generated draft contained meta or instruction language.' };
    }

    return {
      mode: 'ai-assisted',
      aiDraft: {
        title: aiTitle,
        description: aiDescription,
        keywords: aiKeywords
      },
      aiError: null
    };
  } catch (error) {
    return {
      mode: 'rule-based',
      aiDraft: null,
      aiError: `AI fallback: ${error instanceof Error ? error.message : 'OpenAI request failed.'}`
    };
  }
}

async function createListPayload(input) {
  const tokens = tokenize(input);
  const ruleDraft = {
    title: buildRuleTitle(input, tokens),
    description: buildRuleDescription(buildRuleTitle(input, tokens), tokens),
    keywords: buildRuleKeywords(tokens, buildRuleTitle(input, tokens))
  };

  const aiResult = await generateWithAiIfConfigured(input, ruleDraft);
  const title = aiResult.mode === 'ai-assisted' ? finalizeAiTitle(aiResult.aiDraft?.title, ruleDraft.title) : ruleDraft.title;
  const description = aiResult.mode === 'ai-assisted' ? finalizeAiDescription(aiResult.aiDraft?.description, ruleDraft.description) : ruleDraft.description;
  const keywords = aiResult.mode === 'ai-assisted' ? finalizeAiKeywords(aiResult.aiDraft?.keywords) : ruleDraft.keywords;
  const seoScoreValue = computeSeoScore(title, keywords);
  const geoScoreValue = computeGeoScore(title, description, keywords);
  const aeoScoreValue = computeAeoScore(description, title, keywords);
  const score = computeOverallScore(seoScoreValue, geoScoreValue, aeoScoreValue, title, description, keywords);
  const status = scoreStatus(score);
  const notes = buildNotes({
    seo: seoScoreValue,
    geo: geoScoreValue,
    aeo: aeoScoreValue,
    title,
    description,
    keywords,
    score,
    mode: aiResult.mode
  });

  return {
    input,
    title,
    description,
    keywords: keywords.join(', '),
    keywordList: keywords,
    seoScore: seoScoreValue,
    geoScore: geoScoreValue,
    aeoScore: aeoScoreValue,
    score,
    status,
    notes,
    engineMode: aiResult.mode,
    aiConfigured: sanitizeApiKey(process.env.OPENAI_API_KEY ?? '') !== '',
    aiError: aiResult.aiError ?? null,
    diagnostics: {
      projectHeader: sanitizeOptionalHeader(process.env.OPENAI_PROJECT_ID ?? '') !== '',
      organizationHeader: sanitizeOptionalHeader(process.env.OPENAI_ORGANIZATION_ID ?? '') !== '',
      titleLength: title.length,
      titleFirstForty: title.slice(0, 40),
      descriptionOpening: description.slice(0, 40),
      keywordCount: keywords.length,
      keywordLengths: keywords.map((keyword) => keyword.length)
    }
  };
}

marketIntelligenceRouter.get('/foundation', (_req, res) => {
  res.json({
    module: 'create-a-list',
    mode: 'seo-geo-aeo',
    outputs: ['title', 'description', 'keywords', 'seoScore', 'geoScore', 'aeoScore', 'score', 'status', 'notes'],
    keywordRules: {
      count: 13,
      maxCharactersPerKeyword: 20,
      output: 'comma-separated'
    },
    titleRules: {
      maxLength: 140,
      firstFortyPriority: true
    },
    descriptionRules: {
      openingPriority: true
    },
    scoring: {
      seo: 'search structure and keyword fit',
      geo: 'natural language and generative fit',
      aeo: 'answer clarity and opening strength'
    },
    generationModes: {
      default: 'rule-based',
      optional: 'ai-assisted when OPENAI_API_KEY is configured'
    }
  });
});

marketIntelligenceRouter.post('/create-list', async (req, res) => {
  const input = normalizeWhitespace(req.body?.input ?? '');
  if (!input) {
    res.status(400).json({ error: 'input is required' });
    return;
  }

  const payload = await createListPayload(input);
  res.json(payload);
});
