/**
 * ResumeStyle — detected visual style from the uploaded file.
 * Used to reproduce the same look in PDF and DOCX exports.
 */

export interface ResumeStyle {
  fontFamily: string;       // body font, e.g. 'Calibri', 'Times New Roman', 'Georgia'
  nameFontSize: number;     // pt
  headingFontSize: number;  // pt
  bodyFontSize: number;     // pt
  headingColor: string;     // hex without #, e.g. '1F3864'
  bodyColor: string;        // hex without #
  ruleColor: string;        // section rule line color
  headingUppercase: boolean;
  headingBold: boolean;
  lineHeight: number;       // e.g. 1.15, 1.3
  source: 'docx' | 'pdf' | 'default';
}

export const DEFAULT_STYLE: ResumeStyle = {
  fontFamily:       'Calibri',
  nameFontSize:     20,
  headingFontSize:  11,
  bodyFontSize:     10.5,
  headingColor:     '111111',
  bodyColor:        '1a1a1a',
  ruleColor:        'aaaaaa',
  headingUppercase: true,
  headingBold:      true,
  lineHeight:       1.35,
  source:           'default',
};

// ── DOCX style extractor via raw XML ─────────────────────────────────────────
export async function extractDocxStyle(arrayBuffer: ArrayBuffer): Promise<ResumeStyle> {
  const style: ResumeStyle = { ...DEFAULT_STYLE, source: 'docx' };

  try {
    const PizZip = (await import('pizzip')).default;
    const zip = new PizZip(arrayBuffer);

    // ── styles.xml ──
    const stylesXml = zip.file('word/styles.xml')?.asText() ?? '';
    if (!stylesXml) return style;

    // Find the Normal / Default paragraph style block
    const normalBlock = stylesXml.match(
      /<w:style[^>]*w:styleId="Normal"[\s\S]*?<\/w:style>/
    )?.[0] ?? '';

    if (normalBlock) {
      // Font
      const fontMatch = normalBlock.match(/w:ascii="([^"]+)"/);
      if (fontMatch) style.fontFamily = fontMatch[1];

      // Font size (half-points)
      const szMatch = normalBlock.match(/<w:sz w:val="(\d+)"/);
      if (szMatch) style.bodyFontSize = parseInt(szMatch[1]) / 2;

      // Body color
      const colorMatch = normalBlock.match(/<w:color w:val="([0-9A-Fa-f]{6})"/);
      if (colorMatch) style.bodyColor = colorMatch[1];
    }

    // Heading 1 block — look for styleId="Heading1" OR styleId that contains "Heading"
    const headingBlock = (
      stylesXml.match(/<w:style[^>]*w:styleId="Heading1"[\s\S]*?<\/w:style>/)?.[0] ??
      stylesXml.match(/<w:style[^>]*w:styleId="[^"]*[Hh]eading[^"]*1[^"]*"[\s\S]*?<\/w:style>/)?.[0] ??
      ''
    );

    if (headingBlock) {
      const hColorMatch = headingBlock.match(/<w:color w:val="([0-9A-Fa-f]{6})"/);
      if (hColorMatch) style.headingColor = hColorMatch[1];

      const hSzMatch = headingBlock.match(/<w:sz w:val="(\d+)"/);
      if (hSzMatch) style.headingFontSize = parseInt(hSzMatch[1]) / 2;

      // Detect uppercase transform
      style.headingUppercase = /w:val="uppercase"/i.test(headingBlock);
      style.headingBold = /<w:b\/>|<w:b w:val="true"/.test(headingBlock);
    }

    // ── theme colors from word/theme/theme1.xml ──
    const themeXml = zip.file('word/theme/theme1.xml')?.asText() ?? '';
    if (themeXml && style.headingColor === DEFAULT_STYLE.headingColor) {
      // Try to pick up accent / dark1 color
      const dk1 = themeXml.match(/<a:dk1>[\s\S]*?<a:srgbClr val="([0-9A-Fa-f]{6})"/)?.[1];
      if (dk1) style.headingColor = dk1;
    }
  } catch (e) {
    console.warn('DOCX style extraction failed:', e);
  }

  return style;
}

// ── PDF style extractor via pdfjs text items ──────────────────────────────────
export async function extractPdfStyle(
  items: Array<{ str: string; transform: number[]; fontName?: string; height?: number }>
): Promise<ResumeStyle> {
  const style: ResumeStyle = { ...DEFAULT_STYLE, source: 'pdf' };

  if (!items.length) return style;

  // Collect font heights
  const heights = items
    .filter(i => i.str.trim())
    .map(i => i.height ?? Math.abs(i.transform[3]));

  const maxH = Math.max(...heights);
  const avgH = heights.reduce((a, b) => a + b, 0) / heights.length;

  // Estimate pt sizes (pdfjs height is in user units, ~1 unit ≈ 1pt at 72dpi)
  style.nameFontSize    = Math.round(maxH);
  style.bodyFontSize    = Math.round(avgH * 10) / 10;
  style.headingFontSize = Math.round((maxH + avgH) / 2);

  // Try to detect font family from embedded font names
  const fontNames = [...new Set(
    items.map(i => i.fontName ?? '').filter(Boolean)
  )];

  for (const raw of fontNames) {
    // Strip subset prefix like "ABCDEF+"
    const name = raw.replace(/^[A-Z]{6}\+/, '').toLowerCase();
    if (/times|roman|serif/.test(name)) { style.fontFamily = 'Times New Roman'; break; }
    if (/georgia/.test(name))            { style.fontFamily = 'Georgia';         break; }
    if (/garamond/.test(name))           { style.fontFamily = 'Garamond';        break; }
    if (/arial/.test(name))              { style.fontFamily = 'Arial';           break; }
    if (/helvetica/.test(name))          { style.fontFamily = 'Helvetica';       break; }
    if (/calibri/.test(name))            { style.fontFamily = 'Calibri';         break; }
    if (/cambria/.test(name))            { style.fontFamily = 'Cambria';         break; }
    if (/palatino/.test(name))           { style.fontFamily = 'Palatino';        break; }
    if (/lato/.test(name))               { style.fontFamily = 'Lato';            break; }
    if (/roboto/.test(name))             { style.fontFamily = 'Roboto';          break; }
  }

  return style;
}
