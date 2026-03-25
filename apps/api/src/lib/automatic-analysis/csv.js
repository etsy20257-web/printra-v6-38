import { normalizeWhitespace } from './normalize.js';

function splitCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += character;
  }

  values.push(current.trim());
  return values.map((value) => value.replace(/^"|"$/g, '').trim());
}

function normalizeHeader(header) {
  const normalized = String(header ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const aliases = {
    url: 'listing_url',
    listing: 'listing_url',
    listingurl: 'listing_url',
    listing_link: 'listing_url',
    product_url: 'listing_url',
    shop_url: 'store_url',
    shop: 'store_url',
    shoplink: 'store_url',
    store: 'store_url',
    storeurl: 'store_url',
    content: 'listing_text',
    listing_content: 'listing_text',
    listing_description: 'listing_text',
    description: 'description',
    body: 'description',
    store_content: 'store_text',
    shop_text: 'store_text',
    about: 'store_text',
    review_count: 'reviews',
    reviewcount: 'reviews',
    sales_count: 'sales',
    salescount: 'sales',
    image_count: 'images',
    imagecount: 'images',
    variation_count: 'variations',
    variationcount: 'variations',
    product_count: 'products',
    productcount: 'products',
    tags: 'keywords'
  };
  return aliases[normalized] ?? normalized;
}

export function parseCsvText(csvText) {
  const text = normalizeWhitespace(csvText);
  if (!text) return [];
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  const rows = [];

  for (const line of lines.slice(1)) {
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    row.__source = 'csv';
    row.platform = String(row.platform || '').trim().toLowerCase() || 'csv';
    rows.push(row);
  }

  return rows;
}
