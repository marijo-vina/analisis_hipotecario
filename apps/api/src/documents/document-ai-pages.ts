import { OcrLayout } from './document-ai.types';

export interface OcrPart {
  startPage: number;
  ocrText: string;
  ocrLayout: OcrLayout;
}

export function pagesOverSyncLimit(
  error: unknown,
): { limit: number; total: number } | null {
  const message = errorText(error);
  const match = /pages exceed the limit:\s*(\d+)\s*got\s*(\d+)/i.exec(message);
  if (!match) return null;
  const limit = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(limit) || !Number.isFinite(total) || limit < 1 || total <= limit) {
    return null;
  }
  return { limit, total };
}

export function pageWindows(totalPages: number, limit: number): number[][] {
  const windows: number[][] = [];
  const size = Math.max(1, limit);
  for (let start = 1; start <= totalPages; start += size) {
    const end = Math.min(start + size - 1, totalPages);
    const pages: number[] = [];
    for (let page = start; page <= end; page += 1) pages.push(page);
    windows.push(pages);
  }
  return windows;
}

export function mergeOcrParts(parts: OcrPart[]): { ocrText: string; ocrLayout: OcrLayout } {
  return {
    ocrText: parts
      .map((part) => part.ocrText)
      .filter((text) => text.trim() !== '')
      .join('\n'),
    ocrLayout: {
      pages: parts.flatMap((part) =>
        part.ocrLayout.pages.map((page, index) => ({
          ...page,
          pageNumber: part.startPage + index,
        })),
      ),
    },
  };
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}
