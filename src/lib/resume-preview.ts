/**
 * Builds an embeddable styled HTML fragment from plain-text resume content.
 * Mirrors the visual style of the original resume (fonts, colors, headings).
 * Returns a <style> + <div> fragment suitable for dangerouslySetInnerHTML.
 */

import { parseResumeForExport, type StructuredResume } from './resume-export-parser';
import { DEFAULT_STYLE, type ResumeStyle } from './resume-style';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function serifFallback(font: string): string {
  const lower = font.toLowerCase();
  if (/times|roman|garamond|palatino|georgia|cambria/.test(lower)) return 'Georgia, serif';
  return "'Segoe UI', Arial, sans-serif";
}

function hex(c: string): string {
  return c.startsWith('#') ? c : `#${c}`;
}

function buildPreviewCss(s: ResumeStyle): string {
  const font   = `'${s.fontFamily}', ${serifFallback(s.fontFamily)}`;
  const hColor = hex(s.headingColor);
  const bColor = hex(s.bodyColor);
  const rColor = hex(s.ruleColor);

  return `<style>
    .resume-preview {
      font-family: ${font};
      font-size: ${s.bodyFontSize}pt;
      line-height: ${s.lineHeight};
      color: ${bColor};
      background: #ffffff;
      padding: 18pt 15pt;
      max-width: 100%;
      overflow-wrap: break-word;
      word-break: break-word;
    }
    .resume-preview .resume-name {
      font-size: ${s.nameFontSize}pt;
      font-weight: 700;
      text-align: center;
      color: ${bColor};
      margin-bottom: 4pt;
    }
    .resume-preview .resume-contact {
      text-align: center;
      font-size: ${Math.max(s.bodyFontSize - 0.5, 8)}pt;
      color: ${bColor};
      opacity: 0.75;
      line-height: 1.6;
      margin-bottom: 10pt;
    }
    .resume-preview .section-heading {
      font-size: ${s.headingFontSize}pt;
      font-weight: ${s.headingBold ? '700' : '600'};
      text-transform: ${s.headingUppercase ? 'uppercase' : 'none'};
      letter-spacing: ${s.headingUppercase ? '0.8px' : '0'};
      color: ${hColor};
      border-bottom: 0.75pt solid ${rColor};
      padding-bottom: 1.5pt;
      margin-top: 10pt;
      margin-bottom: 4pt;
    }
    .resume-preview .body-line {
      font-size: ${s.bodyFontSize}pt;
      color: ${bColor};
      margin-bottom: 1.5pt;
    }
    .resume-preview .bullet-line {
      font-size: ${s.bodyFontSize}pt;
      color: ${bColor};
      margin-bottom: 1.5pt;
      padding-left: 14pt;
      text-indent: -10pt;
    }
    .resume-preview .bullet-line::before {
      content: '• ';
      color: ${bColor};
    }
    .resume-preview .sub-bullet-line {
      font-size: ${Math.max(s.bodyFontSize - 0.5, 8)}pt;
      color: ${bColor};
      margin-bottom: 1pt;
      padding-left: 26pt;
      text-indent: -10pt;
      opacity: 0.85;
    }
    .resume-preview .sub-bullet-line::before {
      content: '◦ ';
    }
    .resume-preview .spacer {
      margin-top: 3pt;
    }
  </style>`;
}

function buildPreviewBody(resume: StructuredResume): string {
  const parts: string[] = [];

  if (resume.name) {
    parts.push(`<div class="resume-name">${esc(resume.name)}</div>`);
  }
  if (resume.contactLines.length) {
    const lines = resume.contactLines.filter(l => l.trim()).map(esc).join('<br>');
    parts.push(`<div class="resume-contact">${lines}</div>`);
  }

  for (const block of resume.blocks) {
    if (block.heading) {
      parts.push(`<div class="section-heading">${esc(block.heading)}</div>`);
    }
    for (const line of block.lines) {
      if (line.type === 'blank') {
        parts.push(`<div class="spacer"></div>`);
        continue;
      }
      if (line.type === 'bullet') {
        parts.push(`<div class="bullet-line">${esc(line.text.replace(/^[-•*▪◦▸►→]\s*/, ''))}</div>`);
        continue;
      }
      if (line.type === 'sub_bullet') {
        parts.push(`<div class="sub-bullet-line">${esc(line.text.replace(/^[-•*▪◦▸►→]\s*/, ''))}</div>`);
        continue;
      }
      parts.push(`<div class="body-line">${esc(line.text)}</div>`);
    }
  }

  return parts.join('\n');
}

export function buildResumePreviewHtml(text: string, style: ResumeStyle = DEFAULT_STYLE): string {
  try {
    const resume = parseResumeForExport(text);
    const css    = buildPreviewCss(style);
    const body   = buildPreviewBody(resume);
    return `${css}<div class="resume-preview">${body}</div>`;
  } catch {
    const escaped = esc(text);
    return `<div class="resume-preview" style="font-family:monospace;font-size:12px;white-space:pre-wrap;padding:1rem;background:#fff;color:#111">${escaped}</div>`;
  }
}
