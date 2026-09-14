// partner-platform/pdfOcr.ts — PARTNER-MULTI-BRAND-MANUAL-PDF-ORDER-INGESTION-001
//
// Browser-side OCR fallback for image-only partner PDFs.
//
// WHY IN THE BROWSER
//   Server-side text extraction (unpdf) runs first inside partner-manual-intake.
//   When a PDF has no usable text layer (a scan or a photographed order), the
//   draft is parked as `ocr_required` and the ADMIN'S OWN BROWSER renders each
//   page to a canvas and runs tesseract.js on it. The page images never leave
//   the admin's machine; only the recognised TEXT is posted back to the intake
//   function, which parses it with the same extractor as the text layer. No PDF
//   content is sent to any third-party OCR service.
//
// Both libraries are loaded lazily (dynamic import) so the admin bundle does
// not pay for them until an OCR fallback is actually needed.

export interface OcrPageResult {
  page: number;
  text: string;
  confidence: number; // tesseract mean confidence 0-100
}

export const OCR_ENGINE = "tesseract.js@5.1.1+pdfjs-dist@4.10.38";
const MAX_OCR_PAGES = 20;
const RENDER_SCALE = 2.2; // ~1350px wide for a Letter page — enough for OCR

type Progress = (info: { stage: "render" | "ocr"; page: number; pages: number; pct: number }) => void;

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default as string;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  return pdfjs;
}

/** Render every page (or the requested pages) of a PDF file to PNG data URLs. */
export async function renderPdfPages(file: File, pages: number[] | "all", onProgress?: Progress): Promise<{ page: number; dataUrl: string }[]> {
  const pdfjs = await loadPdfJs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const wanted = (pages === "all" ? Array.from({ length: doc.numPages }, (_, i) => i + 1) : pages)
    .filter((p) => p >= 1 && p <= doc.numPages).slice(0, MAX_OCR_PAGES);
  const out: { page: number; dataUrl: string }[] = [];
  for (let i = 0; i < wanted.length; i++) {
    const pageNo = wanted[i];
    onProgress?.({ stage: "render", page: pageNo, pages: wanted.length, pct: Math.round((i / wanted.length) * 100) });
    const page = await doc.getPage(pageNo);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser");
    await page.render({ canvasContext: ctx, viewport }).promise;
    out.push({ page: pageNo, dataUrl: canvas.toDataURL("image/png") });
    page.cleanup();
  }
  await doc.destroy();
  return out;
}

/** OCR rendered pages locally. Returns text + mean confidence per page. */
export async function ocrPages(rendered: { page: number; dataUrl: string }[], onProgress?: Progress): Promise<OcrPageResult[]> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (m: { status?: string; progress?: number }) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        onProgress?.({ stage: "ocr", page: current, pages: rendered.length, pct: Math.round(m.progress * 100) });
      }
    },
  });
  let current = 0;
  const results: OcrPageResult[] = [];
  try {
    for (const r of rendered) {
      current = r.page;
      onProgress?.({ stage: "ocr", page: r.page, pages: rendered.length, pct: 0 });
      const { data } = await worker.recognize(r.dataUrl);
      results.push({ page: r.page, text: data.text ?? "", confidence: Math.round(data.confidence ?? 0) });
    }
  } finally {
    await worker.terminate();
  }
  return results;
}

/** Convenience: render + OCR in one call. */
export async function ocrPdfFile(file: File, pages: number[] | "all", onProgress?: Progress): Promise<OcrPageResult[]> {
  const rendered = await renderPdfPages(file, pages, onProgress);
  return ocrPages(rendered, onProgress);
}
