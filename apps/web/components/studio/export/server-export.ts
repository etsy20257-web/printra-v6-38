'use client';

export type ExportUploadItem = {
  fileName: string;
  blob: Blob;
  mimeType: string;
};

export type ExportJobStatus = {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  error?: string;
  downloadPath?: string;
};

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Blob could not be converted to data URL'));
    reader.readAsDataURL(blob);
  });
}

export async function createServerExportJob(apiBase: string, items: ExportUploadItem[]): Promise<string> {
  const payloadItems = await Promise.all(
    items.map(async (entry) => ({
      fileName: entry.fileName,
      mimeType: entry.mimeType,
      dataUrl: await blobToDataUrl(entry.blob)
    }))
  );

  const response = await fetch(`${apiBase}/exports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestedBy: 'studio-web',
      items: payloadItems
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Export job could not be queued');
  }
  const payload = await response.json();
  if (!payload?.jobId) {
    throw new Error('Export job id is missing');
  }
  return payload.jobId;
}

async function readJobStatus(apiBase: string, jobId: string): Promise<ExportJobStatus> {
  const response = await fetch(`${apiBase}/exports/${jobId}`, { cache: 'no-store' });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Export status could not be read');
  }
  return response.json() as Promise<ExportJobStatus>;
}

export async function waitForServerExport(
  apiBase: string,
  jobId: string,
  onTick?: (status: ExportJobStatus) => void,
  options?: { timeoutMs?: number; intervalMs?: number }
): Promise<ExportJobStatus> {
  const timeoutMs = options?.timeoutMs ?? 90_000;
  const intervalMs = options?.intervalMs ?? 900;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = await readJobStatus(apiBase, jobId);
    onTick?.(status);
    if (status.status === 'completed' || status.status === 'failed') {
      return status;
    }
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }

  throw new Error('Export polling timed out');
}

export async function downloadServerExport(apiBase: string, jobId: string, fallbackFileName: string) {
  const response = await fetch(`${apiBase}/exports/${jobId}/download`, { cache: 'no-store' });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Export archive could not be downloaded');
  }

  const blob = await response.blob();
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = fallbackFileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
