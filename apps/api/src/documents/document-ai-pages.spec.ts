import { mergeOcrParts, pageWindows, pagesOverSyncLimit } from './document-ai-pages';

describe('pagesOverSyncLimit', () => {
  it('reads the Document AI page-limit error', () => {
    const error = new Error(
      '3 INVALID_ARGUMENT: Document pages exceed the limit: 30 got 35',
    );
    expect(pagesOverSyncLimit(error)).toEqual({ limit: 30, total: 35 });
  });

  it('ignores other Document AI failures', () => {
    expect(pagesOverSyncLimit(new Error('gRPC error: deadline exceeded'))).toBeNull();
  });
});

describe('pageWindows', () => {
  it('splits 35 pages into a window of 30 and a remainder', () => {
    const windows = pageWindows(35, 30);
    expect(windows).toHaveLength(2);
    expect(windows[0]).toHaveLength(30);
    expect(windows[0][0]).toBe(1);
    expect(windows[0][29]).toBe(30);
    expect(windows[1]).toEqual([31, 32, 33, 34, 35]);
  });
});

describe('mergeOcrParts', () => {
  it('renumbers the second window from its original start page', () => {
    const merged = mergeOcrParts([
      {
        startPage: 1,
        ocrText: 'primera',
        ocrLayout: { pages: [{ pageNumber: 1, width: 1, height: 1, lines: [], tokens: [] }] },
      },
      {
        startPage: 31,
        ocrText: 'segunda',
        ocrLayout: { pages: [{ pageNumber: 1, width: 1, height: 1, lines: [], tokens: [] }] },
      },
    ]);

    expect(merged.ocrText).toBe('primera\nsegunda');
    expect(merged.ocrLayout.pages.map((page) => page.pageNumber)).toEqual([1, 31]);
  });
});
