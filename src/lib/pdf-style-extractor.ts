/**
 * Extract visual style from a PDF using pdfjs.
 * Returns style info used to reproduce the same look in the tailored export.
 */

import * as pdfjsLib from 'pdfjs-dist';
import { DEFAULT_STYLE, type ResumeStyle } from './resume-style';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface PdfTextItem {
  str:       string;
  x:         number;
  y:         number;
  fontSize:  number;   // estimated pt
  fontName:  string;
  isBold:    boolean;
}

export interface ParsedPdf {
  text:    string;          // plain text for AI processing
  items:   PdfTextItem[];   // structured items for style detection
  style:   ResumeStyle;     // detected visual style
  pageCount: number;
}

// ── Text extraction + style detection ─────────────────────────────────────────
export async function parsePdfFile(file: File): Promise<ParsedPdf> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;

  const allItems: PdfTextItem[] = [];
  const pages: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();

    const rawItems = content.items as Array<{
      str: string;
      transform: number[];
      fontName?: string;
      height?: number;
    }>;

    // Group by Y for plain-text reconstruction
    const lineMap = new Map<number, string[]>();
    for (const item of rawItems) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5]);
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push(item.str);

      // Estimate font size from transform matrix height or .height field
      const fontSize = item.height
        ? item.height
        : Math.abs(item.transform[3]);

      allItems.push({
        str:      item.str,
        x:        item.transform[4],
        y:        item.transform[5],
        fontSize: Math.round(fontSize * 10) / 10,
        fontName: item.fontName ?? '',
        isBold:   /bold|heavy|black/i.test(item.fontName ?? ''),
      });
    }

    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
    pages.push(sortedYs.map(y => lineMap.get(y)!.join(' ')).join('\n'));
  }

  const text  = pages.join('\n\n').trim();
  const style = detectStyle(allItems);

  return { text, items: allItems, style, pageCount: pdf.numPages };
}

// ── Style detection ────────────────────────────────────────────────────────────
function detectStyle(items: PdfTextItem[]): ResumeStyle {
  const s = { ...DEFAULT_STYLE, source: 'pdf' as const };
  if (!items.length) return s;

  const textItems = items.filter(i => i.str.trim().length > 1);
  if (!textItems.length) return s;

  const sizes = textItems.map(i => i.fontSize).filter(n => n > 0);
  if (!sizes.length) return s;

  const maxSize  = Math.max(...sizes);

  // Name = largest text
  s.nameFontSize = Math.round(maxSize);

  // Body = median-ish (most common size)
  const freq = new Map<number, number>();
  for (const sz of sizes) {
    const rounded = Math.round(sz * 2) / 2; // round to nearest 0.5
    freq.set(rounded, (freq.get(rounded) ?? 0) + 1);
  }
  const [bodySize] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
  s.bodyFontSize = bodySize;

  // Heading = between body and name, or slightly above body
  s.headingFontSize = Math.round((bodySize + maxSize) / 2.2 * 10) / 10;
  if (s.headingFontSize <= bodySize) s.headingFontSize = bodySize + 1;

  // Font family from embedded font names
  const fontNames = [...new Set(textItems.map(i => i.fontName))];
  for (const raw of fontNames) {
    const name = raw.replace(/^[A-Z]{6}\+/, '').toLowerCase();
    if (/times|roman/.test(name))   { s.fontFamily = 'Times New Roman'; break; }
    if (/georgia/.test(name))        { s.fontFamily = 'Georgia';         break; }
    if (/garamond/.test(name))       { s.fontFamily = 'Garamond';        break; }
    if (/cambria/.test(name))        { s.fontFamily = 'Cambria';         break; }
    if (/palatino/.test(name))       { s.fontFamily = 'Palatino';        break; }
    if (/arial/.test(name))          { s.fontFamily = 'Arial';           break; }
    if (/helvetica/.test(name))      { s.fontFamily = 'Helvetica, Arial'; break; }
    if (/calibri/.test(name))        { s.fontFamily = 'Calibri';         break; }
    if (/lato/.test(name))           { s.fontFamily = 'Lato';            break; }
    if (/roboto/.test(name))         { s.fontFamily = 'Roboto';          break; }
    if (/open.?sans/.test(name))     { s.fontFamily = 'Open Sans';       break; }
  }

  // Heading uppercase: detect if large-size items are all-caps
  const headingItems = textItems.filter(
    i => i.fontSize >= s.headingFontSize && i.str.trim().length > 2
  );
  const allCaps = headingItems.filter(i => i.str === i.str.toUpperCase() && /[A-Z]/.test(i.str));
  s.headingUppercase = allCaps.length > headingItems.length * 0.4;

  return s;
}
