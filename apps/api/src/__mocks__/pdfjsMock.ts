// ---------------------------------------------------------------------------
// Jest mock for pdfjs-dist — the real package ships ESM with `import.meta`
// which ts-jest (CommonJS) cannot load. The coordinate extraction service
// is always mocked in the bureau/controller tests, so this stub only needs
// to satisfy the module shape (`getDocument().promise`).
// ---------------------------------------------------------------------------

export const getDocument = jest.fn().mockImplementation(() => ({
  promise: Promise.resolve({
    numPages: 0,
    getPage: jest.fn().mockResolvedValue({
      getViewport: jest.fn().mockReturnValue({ width: 612, height: 792 }),
      getTextContent: jest.fn().mockResolvedValue({ items: [] }),
    }),
  }),
}));