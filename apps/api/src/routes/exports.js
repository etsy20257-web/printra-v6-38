import { Router } from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const exportsRouter = Router();

const EXPORT_ROOT = path.resolve(process.cwd(), 'data', 'export-jobs');
const QUEUE_DIR = path.join(EXPORT_ROOT, 'queue');
const STATUS_DIR = path.join(EXPORT_ROOT, 'status');
const OUTPUT_DIR = path.join(EXPORT_ROOT, 'output');
const MAX_ITEMS = 100;
const MAX_SINGLE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 400 * 1024 * 1024;

async function ensureExportDirs() {
  await fs.mkdir(QUEUE_DIR, { recursive: true });
  await fs.mkdir(STATUS_DIR, { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

function statusFile(jobId) {
  return path.join(STATUS_DIR, `${jobId}.json`);
}

function queueFile(jobId) {
  return path.join(QUEUE_DIR, `${jobId}.json`);
}

function outputFile(jobId) {
  return path.join(OUTPUT_DIR, `${jobId}.zip`);
}

function readDataUrlSizeBytes(dataUrl) {
  const marker = ';base64,';
  const index = dataUrl.indexOf(marker);
  if (index === -1) return 0;
  const base64 = dataUrl.slice(index + marker.length).trim();
  if (!base64) return 0;
  return Math.floor((base64.length * 3) / 4);
}

function sanitizeFileName(value) {
  return String(value ?? '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 160) || 'export-item';
}

function validatePayload(body) {
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) {
    return { ok: false, error: 'items array is required' };
  }
  if (items.length > MAX_ITEMS) {
    return { ok: false, error: `items cannot exceed ${MAX_ITEMS}` };
  }

  let totalBytes = 0;
  const normalized = [];
  for (const raw of items) {
    const fileName = sanitizeFileName(raw?.fileName);
    const dataUrl = typeof raw?.dataUrl === 'string' ? raw.dataUrl : '';
    if (!dataUrl.startsWith('data:') || !dataUrl.includes(';base64,')) {
      return { ok: false, error: `Invalid dataUrl for ${fileName}` };
    }
    const bytes = readDataUrlSizeBytes(dataUrl);
    if (bytes <= 0) {
      return { ok: false, error: `Empty dataUrl for ${fileName}` };
    }
    if (bytes > MAX_SINGLE_BYTES) {
      return { ok: false, error: `${fileName} exceeds ${MAX_SINGLE_BYTES} bytes` };
    }
    totalBytes += bytes;
    normalized.push({
      fileName,
      dataUrl,
      mimeType: typeof raw?.mimeType === 'string' ? raw.mimeType : 'application/octet-stream',
      bytes
    });
  }

  if (totalBytes > MAX_TOTAL_BYTES) {
    return { ok: false, error: `Total export size exceeds ${MAX_TOTAL_BYTES} bytes` };
  }

  return { ok: true, items: normalized, totalBytes };
}

async function readStatus(jobId) {
  const raw = await fs.readFile(statusFile(jobId), 'utf8');
  return JSON.parse(raw);
}

exportsRouter.post('/', async (req, res, next) => {
  try {
    await ensureExportDirs();

    const parsed = validatePayload(req.body ?? {});
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const jobId = randomUUID();
    const now = new Date().toISOString();
    const queuePayload = {
      jobId,
      createdAt: now,
      requestedBy: typeof req.body?.requestedBy === 'string' ? req.body.requestedBy.slice(0, 80) : 'studio-web',
      items: parsed.items
    };

    await fs.writeFile(queueFile(jobId), JSON.stringify(queuePayload), 'utf8');
    await fs.writeFile(
      statusFile(jobId),
      JSON.stringify({
        jobId,
        status: 'queued',
        createdAt: now,
        updatedAt: now,
        totalItems: parsed.items.length,
        totalBytes: parsed.totalBytes
      }),
      'utf8'
    );

    res.status(202).json({
      ok: true,
      jobId,
      status: 'queued'
    });
  } catch (error) {
    next(error);
  }
});

exportsRouter.get('/:jobId', async (req, res, next) => {
  try {
    const { jobId } = req.params;
    await ensureExportDirs();
    const status = await readStatus(jobId);
    res.json({ ok: true, ...status });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      res.status(404).json({ error: 'Export job not found' });
      return;
    }
    next(error);
  }
});

exportsRouter.get('/:jobId/download', async (req, res, next) => {
  try {
    const { jobId } = req.params;
    await ensureExportDirs();
    const status = await readStatus(jobId);
    if (status.status !== 'completed') {
      res.status(409).json({ error: 'Export is not completed yet' });
      return;
    }

    const zipPath = outputFile(jobId);
    await fs.access(zipPath);
    res.setHeader('Cache-Control', 'no-store');
    res.download(zipPath, status.fileName || `printra-export-${jobId}.zip`);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      res.status(404).json({ error: 'Export archive not found' });
      return;
    }
    next(error);
  }
});
