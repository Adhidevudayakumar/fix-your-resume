import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import {
  DEFAULT_STYLE,
  extractDocxStyle,
  extractPdfStyle,
  type ResumeStyle,
} from './resume-style';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface ParsedFile {
  text: string;
  html: string | null;   // styled HTML (mammoth for DOCX, null otherwise)
  style: ResumeStyle;
  fileType: 'pdf' | 'docx' | 'txt' | 'paste';
}

// ── Public entry point ────────────────────────────────────────────────────────
export async function extractFromFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'txt') {
    return { text: await file.text(), html: null, style: DEFAULT_STYLE, fileType: 'txt' };
  }
  if (ext === 'pdf') {
    return parsePdf(file);
  }
  if (ext === 'docx' || ext === 'doc') {
    return parseDocx(file);
  }
  throw new Error(`Unsupported file type: .${ext}. Use .pdf, .docx, or .txt`);
}

// ── PDF ───────────────────────────────────────────────────────────────────────
async function parsePdf(file: File): Promise<ParsedFile> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

  const allItems: Array<{ str: string; transform: number[]; fontName?: string; height?: number }> = [];
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items   = content.items as Array<{
      str: string; transform: number[]; fontName?: string; height?: number;
    }>;

    allItems.push(...items);

    // Group by Y to reconstruct lines
    const lineMap = new Map<number, string[]>();
    for (const item of items) {
      const y = Math.round(item.transform[5]);
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push(item.str);
    }
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
    pages.push(sortedYs.map(y => lineMap.get(y)!.join(' ')).join('\n'));
  }

  const text  = pages.join('\n\n').trim();
  const style = await extractPdfStyle(allItems);

  return { text, html: null, style, fileType: 'pdf' };
}

// ── DOCX ──────────────────────────────────────────────────────────────────────
async function parseDocx(file: File): Promise<ParsedFile> {
  const arrayBuffer = await file.arrayBuffer();

  // Extract plain text
  const textResult = await mammoth.extractRawText({ arrayBuffer });

  // Extract styled HTML — mammoth maps Word styles to semantic HTML
  const htmlResult = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap: [
        "p[style-name='Name']        => h1.resume-name",
        "p[style-name='Section']     => h2.resume-section",
        "p[style-name='Heading 1']   => h2.resume-section",
        "p[style-name='heading 1']   => h2.resume-section",
        "p[style-name='Heading 2']   => h3.resume-sub",
        "p[style-name='Normal']      => p.resume-body",
        "p[style-name='List Bullet'] => ul > li",
        "p[style-name='List Bullet 2'] => ul > li.sub",
      ],
    }
  );

  // Extract DOCX style metadata
  const style = await extractDocxStyle(arrayBuffer);

  return {
    text:     textResult.value.trim(),
    html:     sanitizeHtml(htmlResult.value),
    style,
    fileType: 'docx',
  };
}

// ── Sanitise mammoth HTML before rendering ────────────────────────────────────
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

// Keep old API surface for anything still using it
export async function extractTextFromFile(file: File): Promise<string> {
  const result = await extractFromFile(file);
  return result.text;
}
