import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../../../data');
const historyFile = path.join(dataDir, 'automatic-analysis-history.json');

async function ensureHistoryFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(historyFile);
  } catch {
    await fs.writeFile(historyFile, JSON.stringify({ snapshots: [] }, null, 2), 'utf8');
  }
}

async function readHistory() {
  await ensureHistoryFile();
  const raw = await fs.readFile(historyFile, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.snapshots) ? parsed : { snapshots: [] };
  } catch {
    return { snapshots: [] };
  }
}

function buildSnapshotFromAnalysis(analysis) {
  const firstRow = analysis?.rows?.[0] ?? analysis?.result ?? null;
  const rowCount = Number(analysis?.summary?.count ?? (analysis?.rows?.length || (analysis?.result ? 1 : 0)));
  const mode = String(analysis?.mode ?? 'unknown');
  const sourceLabel = rowCount > 1 ? 'batch' : 'single';
  const primaryTitle = firstRow?.overview?.title ?? 'Untitled analysis';
  const platform = firstRow?.overview?.platform ?? (mode === 'csv' ? 'csv' : 'manual');
  const createdAt = new Date().toISOString();
  const snapshotId = `aa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    id: snapshotId,
    createdAt,
    mode,
    sourceLabel,
    rowCount,
    primaryTitle,
    platform,
    strongestKeyword: analysis?.summary?.strongestKeyword ?? null,
    averagePrice: analysis?.summary?.averagePrice ?? null,
    averageRating: analysis?.summary?.averageRating ?? null,
    averageScores: analysis?.summary?.averageScores ?? null,
    result: firstRow,
    rows: Array.isArray(analysis?.rows) ? analysis.rows.slice(0, 24) : [],
    summary: analysis?.summary ?? null
  };
}

export async function saveAutomaticAnalysisSnapshot(analysis) {
  const history = await readHistory();
  const snapshot = buildSnapshotFromAnalysis(analysis);
  history.snapshots.unshift(snapshot);
  history.snapshots = history.snapshots.slice(0, 60);
  await fs.writeFile(historyFile, JSON.stringify(history, null, 2), 'utf8');
  return snapshot;
}

export async function listAutomaticAnalysisSnapshots(limit = 12) {
  const history = await readHistory();
  return history.snapshots.slice(0, Math.max(1, Math.min(50, Number(limit) || 12)));
}
