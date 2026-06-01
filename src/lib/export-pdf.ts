/**
 * PDF export — browser print API.
 * Reproduces the original resume style via CSS variables driven by ResumeStyle.
 */

import type { StructuredResume } from './resume-export-parser';
import { DEFAULT_STYLE, type ResumeStyle } from './resume-style';

function hex(c: string) { return c.startsWith('#') ? c : `#${c}`; }

// ── CSS ───────────────────────────────────────────────────────────────────────
function buildCss(s: ResumeStyle): string {
  const font   = `'${s.fontFamily}', ${serifFallback(s.fontFamily)}`;
  const hColor = hex(s.headingColor);
  const bColor = hex(s.bodyColor);
  const rColor = hex(s.ruleColor);

  return `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    @page {
      size: A4;
      margin: 18mm 15mm 18mm 15mm;
    }

    body {
      font-family: ${font};
      font-size:   ${s.bodyFontSize}pt;
      line-height: ${s.lineHeight};
      color:       ${bColor};
      background:  #fff;
    }

    .resume-name {
      font-size:   ${s.nameFontSize}pt;
      font-weight: 700;
      text-align:  center;
      color:       ${bColor};
      margin-bottom: 4pt;
    }

    .resume-contact {
      text-align:    center;
      font-size:     ${Math.max(s.bodyFontSize - 0.5, 8)}pt;
      color:         ${bColor};
      opacity:       0.75;
      line-height:   1.6;
      margin-bottom: 10pt;
    }

    .section-heading {
      font-size:        ${s.headingFontSize}pt;
      font-weight:      ${s.headingBold ? '700' : '600'};
      text-transform:   ${s.headingUppercase ? 'uppercase' : 'none'};
      letter-spacing:   ${s.headingUppercase ? '0.8px' : '0'};
      color:            ${hColor};
      border-bottom:    0.75pt solid ${rColor};
      padding-bottom:   1.5pt;
      margin-top:       10pt;
      margin-bottom:    4pt;
    }

    .body-line {
      font-size:     ${s.bodyFontSize}pt;
      color:         ${bColor};
      margin-bottom: 1.5pt;
    }

    .bullet-line {
      font-size:     ${s.bodyFontSize}pt;
      color:         ${bColor};
      margin-bottom: 1.5pt;
      padding-left:  14pt;
      text-indent:   -10pt;
    }
    .bullet-line::before { content: '• '; color: ${bColor}; }

    .sub-bullet-line {
      font-size:     ${Math.max(s.bodyFontSize - 0.5, 8)}pt;
      color:         ${bColor};
      margin-bottom: 1pt;
      padding-left:  26pt;
      text-indent:   -10pt;
      opacity:       0.85;
    }
    .sub-bullet-line::before { content: '◦ '; }

    .spacer { margin-top: 3pt; }

    @media screen {
      body {
        max-width: 210mm;
        margin:    20px auto;
        padding:   18mm 15mm;
        box-shadow: 0 0 24px rgba(0,0,0,0.12);
      }
    }
  `;
}

function serifFallback(font: string): string {
  const lower = font.toLowerCase();
  if (/times|roman|garamond|palatino|georgia|cambria/.test(lower)) return 'Georgia, serif';
  return "'Segoe UI', Arial, sans-serif";
}

// ── HTML builder ──────────────────────────────────────────────────────────────
function esc(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildBody(resume: StructuredResume): string {
  const parts: string[] = [];

  if (resume.name) {
    parts.push(`<div class="resume-name">${esc(resume.name)}</div>`);
  }
  if (resume.contactLines.length) {
    parts.push(
      `<div class="resume-contact">${resume.contactLines.filter(l=>l.trim()).map(esc).join('<br>')}</div>`
    );
  }

  for (const block of resume.blocks) {
    if (block.heading) {
      parts.push(`<div class="section-heading">${esc(block.heading)}</div>`);
    }
    for (const line of block.lines) {
      if (line.type === 'blank')      { parts.push(`<div class="spacer"></div>`); continue; }
      if (line.type === 'bullet')     { parts.push(`<div class="bullet-line">${esc(line.text.replace(/^[-•*▪◦▸►→]\s*/,''))}</div>`); continue; }
      if (line.type === 'sub_bullet') { parts.push(`<div class="sub-bullet-line">${esc(line.text.replace(/^[-•*▪◦▸►→]\s*/,''))}</div>`); continue; }
      parts.push(`<div class="body-line">${esc(line.text)}</div>`);
    }
  }

  return parts.join('\n  ');
}

// ── Main export ───────────────────────────────────────────────────────────────
export function downloadAsPDF(
  resume: StructuredResume,
  style: ResumeStyle = DEFAULT_STYLE
) {
  const css  = buildCss(style);
  const body = buildBody(resume);
  const name = esc(resume.name || 'Resume');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${name}</title>
  <style>${css}</style>
</head>
<body>
  ${body}
  <script>
    window.addEventListener('load', () => setTimeout(() => window.print(), 350));
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (!win) window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
