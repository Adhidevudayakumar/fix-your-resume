/**
 * ATS-friendly DOCX export — uses detected ResumeStyle to match original formatting.
 */

import {
  Document, Packer, Paragraph, TextRun,
  AlignmentType, BorderStyle,
  type IParagraphOptions,
} from 'docx';
import type { StructuredResume } from './resume-export-parser';
import { DEFAULT_STYLE, type ResumeStyle } from './resume-style';

// docx uses half-points (twips) for font size
const hp = (pt: number) => Math.round(pt * 2);

// ── Builders ──────────────────────────────────────────────────────────────────
function namePara(text: string, s: ResumeStyle): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing:   { after: 80 },
    children: [
      new TextRun({
        text,
        bold:  true,
        size:  hp(s.nameFontSize),
        font:  s.fontFamily,
        color: s.bodyColor,
      }),
    ],
  });
}

function contactPara(text: string, s: ResumeStyle): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing:   { after: 40 },
    children: [
      new TextRun({
        text,
        size:  hp(s.bodyFontSize - 0.5),
        font:  s.fontFamily,
        color: s.bodyColor,
      }),
    ],
  });
}

function sectionHeadingPara(text: string, s: ResumeStyle): Paragraph {
  const displayText = s.headingUppercase ? text.toUpperCase() : text;
  return new Paragraph({
    spacing: { before: 160, after: 60 },
    border:  {
      bottom: { style: BorderStyle.SINGLE, size: 4, color: s.ruleColor, space: 2 },
    },
    children: [
      new TextRun({
        text:             displayText,
        bold:             s.headingBold,
        size:             hp(s.headingFontSize),
        font:             s.fontFamily,
        color:            s.headingColor,
        characterSpacing: s.headingUppercase ? 20 : 0,
      }),
    ],
  });
}

function bulletPara(text: string, sub: boolean, s: ResumeStyle): Paragraph {
  const clean = text.replace(/^[-•*▪◦▸►→]\s*/, '');
  return new Paragraph({
    spacing: { after: 30 },
    indent:  { left: sub ? 520 : 260, hanging: 180 },
    children: [
      new TextRun({
        text:  (sub ? '◦  ' : '•  ') + clean,
        size:  hp(sub ? s.bodyFontSize - 0.5 : s.bodyFontSize),
        font:  s.fontFamily,
        color: s.bodyColor,
      }),
    ],
  });
}

function bodyPara(text: string, s: ResumeStyle, opts: Partial<IParagraphOptions> = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 30 },
    ...opts,
    children: [
      new TextRun({ text, size: hp(s.bodyFontSize), font: s.fontFamily, color: s.bodyColor }),
    ],
  });
}

function spacer(): Paragraph {
  return new Paragraph({ spacing: { after: 60 }, children: [new TextRun('')] });
}

// ── Build all paragraphs ──────────────────────────────────────────────────────
function buildParagraphs(resume: StructuredResume, s: ResumeStyle): Paragraph[] {
  const out: Paragraph[] = [];

  if (resume.name) out.push(namePara(resume.name, s));
  for (const cl of resume.contactLines) {
    if (cl.trim()) out.push(contactPara(cl, s));
  }
  if (resume.name || resume.contactLines.length) out.push(spacer());

  for (const block of resume.blocks) {
    if (block.heading) out.push(sectionHeadingPara(block.heading, s));
    for (const line of block.lines) {
      if (line.type === 'blank')      { out.push(spacer());                          continue; }
      if (line.type === 'bullet')     { out.push(bulletPara(line.text, false, s));   continue; }
      if (line.type === 'sub_bullet') { out.push(bulletPara(line.text, true,  s));   continue; }
      out.push(bodyPara(line.text, s));
    }
  }

  return out;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function downloadAsDOCX(
  resume: StructuredResume,
  filename  = 'resume',
  style: ResumeStyle = DEFAULT_STYLE
) {
  const doc = new Document({
    creator: 'Fix Your Resume (FYR)',
    title:   resume.name || 'Resume',
    sections: [{
      properties: {
        page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } },
      },
      children: buildParagraphs(resume, style),
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${filename}.docx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
