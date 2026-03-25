import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import yazl from 'yazl';

const EXPORT_ROOT = path.resolve(process.cwd(), 'data', 'export-jobs');
const QUEUE_DIR = path.join(EXPORT_ROOT, 'queue');
const PROCESSING_DIR = path.join(EXPORT_ROOT, 'processing');
const STATUS_DIR = path.join(EXPORT_ROOT, 'status');
const OUTPUT_DIR = path.join(EXPORT_ROOT, 'output');
const POLL_INTERVAL_MS = Number(process.env.PRINTRA_EXPORT_POLL_INTERVAL_MS || 800);
const MAX_PARALLEL = Math.max(1, Number(process.env.PRINTRA_EXPORT_WORKERS || 2));
const workerId = `worker-${process.pid}`;

function statusFile(jobId) {
  return path.join(STATUS_DIR, `${jobId}.json`);
}

function outputFile(jobId) {
  return path.join(OUTPUT_DIR, `${jobId}.zip`);
}

async function ensureDirs() {
  await fs.mkdir(QUEUE_DIR, { recursive: true });
  await fs.mkdir(PROCESSING_DIR, { recursive: true });
  await fs.mkdir(STATUS_DIR, { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(String(dataUrl ?? '').trim());
  if (!match) {
    throw new Error('Invalid dataUrl payload');
  }
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64')
  };
}

function sanitizeFileName(value) {
  return String(value ?? '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 160) || 'export-item';
}

async function writeStatus(jobId, patch) {
  const now = new Date().toISOString();
  const filePath = statusFile(jobId);
  let base = {};
  try {
    base = JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    base = { jobId };
  }
  const next = { ...base, ...patch, updatedAt: now };
  await fs.writeFile(filePath, JSON.stringify(next), 'utf8');
  return next;
}

async function finalizeZip(jobId, items) {
  const zipPath = outputFile(jobId);
  const zip = new yazl.ZipFile();
  for (const item of items) {
    const decoded = parseDataUrl(item.dataUrl);
    const ext = decoded.mimeType === 'image/jpeg' ? 'jpg' : decoded.mimeType === 'image/png' ? 'png' : decoded.mimeType === 'application/pdf' ? 'pdf' : 'bin';
    const fileName = sanitizeFileName(item.fileName).includes('.') ? sanitizeFileName(item.fileName) : `${sanitizeFileName(item.fileName)}.${ext}`;
    zip.addBuffer(decoded.buffer, fileName);
  }
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(zipPath));
  return zipPath;
}

async function claimQueueEntry(entryName) {
  const source = path.join(QUEUE_DIR, entryName);
  const target = path.join(PROCESSING_DIR, entryName);
  try {
    await fs.rename(source, target);
    return target;
  } catch {
    return null;
  }
}

async function processEntry(entryPath) {
  const raw = await fs.readFile(entryPath, 'utf8');
  const job = JSON.parse(raw);
  if (!job?.jobId || !Array.isArray(job.items)) {
    throw new Error('Malformed export job payload');
  }

  await writeStatus(job.jobId, {
    status: 'processing',
    startedAt: new Date().toISOString(),
    workerId
  });

  const zipPath = await finalizeZip(job.jobId, job.items);
  const zipStat = await fs.stat(zipPath);
  await writeStatus(job.jobId, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    fileName: `printra-export-${job.jobId}.zip`,
    outputBytes: zipStat.size,
    downloadPath: `/exports/${job.jobId}/download`
  });
  await fs.unlink(entryPath);
}

async function runTick() {
  await ensureDirs();
  const entries = await fs.readdir(QUEUE_DIR);
  if (!entries.length) return;

  const candidates = entries.filter((entry) => entry.endsWith('.json')).slice(0, MAX_PARALLEL);
  await Promise.all(
    candidates.map(async (entryName) => {
      const claimed = await claimQueueEntry(entryName);
      if (!claimed) return;

      try {
        await processEntry(claimed);
      } catch (error) {
        let jobId = entryName.replace(/\.json$/, '');
        try {
          const raw = await fs.readFile(claimed, 'utf8');
          const payload = JSON.parse(raw);
          jobId = payload?.jobId || jobId;
        } catch {
          // noop
        }
        await writeStatus(jobId, {
          status: 'failed',
          failedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown worker failure',
          workerId
        });
        await fs.unlink(claimed).catch(() => null);
      }
    })
  );
}

console.log('[printra-worker] export lane booted');
console.log(`[printra-worker] worker-id=${workerId}`);
console.log(`[printra-worker] poll-interval-ms=${POLL_INTERVAL_MS}`);
console.log(`[printra-worker] max-parallel=${MAX_PARALLEL}`);

setInterval(() => {
  void runTick().catch((error) => {
    console.error('[printra-worker] tick-error', error);
  });
}, POLL_INTERVAL_MS);

void runTick().catch((error) => {
  console.error('[printra-worker] first-tick-error', error);
});
