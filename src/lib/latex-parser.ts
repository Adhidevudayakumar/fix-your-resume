/**
 * LaTeX resume parser — pure client-side, no compiler needed.
 *
 * Handles the most common resume LaTeX classes:
 *   moderncv, awesome-cv, deedy-resume, res, altacv, Jake's resume template, plain article
 *
 * Pipeline:
 *   1. Detect style from preamble (font packages, colors, class)
 *   2. Extract body text (strip commands → plain text for AI)
 *   3. Render body to HTML (for preview)
 *   4. Locate Experience / Projects sections (for targeted AI call)
 */

import { DEFAULT_STYLE, type ResumeStyle } from './resume-style';

// ── Result types ──────────────────────────────────────────────────────────────
export interface LatexSection {
  heading: string;
  startPos: number;   // char index in body source
  endPos: number;
  latexContent: string;
  plainText: string;
}

export interface LatexParseResult {
  preamble:   string;
  body:       string;       // raw LaTeX body (between \begin{document}...\end{document})
  plainText:  string;       // stripped plain text for AI
  html:       string;       // rendered HTML for preview
  style:      ResumeStyle;
  sections:   LatexSection[];
  name:       string;
  contactLines: string[];
}

// ── Style detection from preamble ─────────────────────────────────────────────
export function detectLatexStyle(preamble: string): ResumeStyle {
  const s = { ...DEFAULT_STYLE, source: 'default' as const };
  const p = preamble.toLowerCase();

  // Font family
  if (/usepackage.*times|usepackage.*\{mathptmx\}/.test(p))     s.fontFamily = 'Times New Roman';
  else if (/usepackage.*palatino|usepackage.*\{mathpazo\}/.test(p)) s.fontFamily = 'Palatino';
  else if (/usepackage.*helvet/.test(p))                          s.fontFamily = 'Helvetica, Arial, sans-serif';
  else if (/usepackage.*garamond/.test(p))                        s.fontFamily = 'Garamond';
  else if (/usepackage.*lmodern/.test(p))                         s.fontFamily = 'Latin Modern Roman, serif';
  else if (/usepackage.*charter/.test(p))                         s.fontFamily = 'Bitstream Charter, Georgia, serif';
  else if (/usepackage.*roboto/.test(p))                          s.fontFamily = 'Roboto, sans-serif';
  else if (/usepackage.*sourcesanspro|source.sans/.test(p))       s.fontFamily = 'Source Sans Pro, sans-serif';
  else if (/fontfamily.*cmr|computer.modern/.test(p))             s.fontFamily = 'Computer Modern, Times New Roman, serif';

  // Document class → default font override
  const classMatch = preamble.match(/\\documentclass(?:\[.*?\])?\{([^}]+)\}/);
  const docClass = classMatch?.[1]?.toLowerCase() ?? '';
  if (docClass === 'moderncv')  { s.fontFamily = s.fontFamily === 'Calibri' ? 'Arial, sans-serif' : s.fontFamily; }
  if (docClass === 'awesome-cv') { s.fontFamily = 'Source Sans Pro, sans-serif'; }

  // Heading color — try to find \definecolor or \colorlet for accent/primary
  const colorPatterns = [
    /\\definecolor\{(?:accent|primary|main|heading|color1)[^}]*\}\{RGB\}\{(\d+),(\d+),(\d+)\}/i,
    /\\definecolor\{(?:accent|primary|main|heading|color1)[^}]*\}\{HTML\}\{([0-9A-Fa-f]{6})\}/i,
    /\\colorlet\{(?:accent|primary|main)\}\{([^}]+)\}/i,
  ];
  for (const pat of colorPatterns) {
    const m = preamble.match(pat);
    if (m) {
      if (m[3]) {
        // RGB
        const hex = [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
        s.headingColor = hex;
      } else if (m[1]?.length === 6) {
        s.headingColor = m[1];
      }
      break;
    }
  }

  // Named LaTeX colors
  const namedColors: Record<string, string> = {
    blue: '2563EB', darkblue: '1E3A5F', navy: '001F5B',
    red: 'DC2626', darkred: '7F1D1D',
    black: '111111', darkgray: '374151', gray: '6B7280',
    teal: '0D9488', green: '16A34A',
  };
  if (namedColors[s.headingColor.toLowerCase()]) {
    s.headingColor = namedColors[s.headingColor.toLowerCase()];
  }

  // Font sizes from documentclass options
  const sizeMatch = preamble.match(/documentclass\[([^\]]*)\]/);
  const opts = sizeMatch?.[1] ?? '';
  if (/11pt/.test(opts))      s.bodyFontSize = 11;
  else if (/12pt/.test(opts)) s.bodyFontSize = 12;
  else if (/10pt/.test(opts)) s.bodyFontSize = 10;
  s.nameFontSize    = s.bodyFontSize + 8;
  s.headingFontSize = s.bodyFontSize + 1;

  // Detect uppercase headings (moderncv, awesome-cv typically use uppercase)
  s.headingUppercase = /moderncv|awesome.cv|deedy/.test(docClass);

  return s;
}

// ── Strip LaTeX commands → plain text ─────────────────────────────────────────
export function latexToPlainText(tex: string): string {
  let t = tex;

  // Remove comments
  t = t.replace(/%[^\n]*/g, '');

  // Common text-producing commands → keep content
  t = t.replace(/\\(?:textbf|textit|texttt|emph|underline|textrm|textsf)\{([^}]*)\}/g, '$1');
  t = t.replace(/\\(?:href|hyperref)\{[^}]*\}\{([^}]*)\}/g, '$1');
  t = t.replace(/\\(?:color|textcolor)\{[^}]*\}\{([^}]*)\}/g, '$1');

  // Section commands
  t = t.replace(/\\(?:section|subsection|subsubsection)\*?\{([^}]*)\}/g, '\n$1\n');
  t = t.replace(/\\cventry\{[^}]*\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{[^}]*\}\{([^}]*)\}/g,
    '$1 at $2 ($3)\n$4');
  t = t.replace(/\\cvitem\{([^}]*)\}\{([^}]*)\}/g, '$1: $2');
  t = t.replace(/\\cvlistitem\{([^}]*)\}/g, '- $1');

  // moderncv / awesome-cv specific
  t = t.replace(/\\name\{([^}]*)\}\{([^}]*)\}/g, '$1 $2');
  t = t.replace(/\\(?:phone|email|homepage|address|social)\[[^\]]*\]\{([^}]*)\}/g, '$1');
  t = t.replace(/\\(?:position|extrainfo)\{([^}]*)\}/g, '$1');
  t = t.replace(/\\cvsection\{([^}]*)\}/g, '\n$1\n');
  t = t.replace(/\\cvsubsection\{([^}]*)\}/g, '\n$1\n');

  // List items
  t = t.replace(/\\item\s*\[([^\]]*)\]/g, '- ');
  t = t.replace(/\\item\s*/g, '- ');

  // Line breaks / paragraphs
  t = t.replace(/\\\\/g, '\n');
  t = t.replace(/\\newline\b/g, '\n');
  t = t.replace(/\\par\b/g, '\n\n');
  t = t.replace(/\\noindent\b/g, '');
  t = t.replace(/\\medskip\b|\\smallskip\b|\\bigskip\b|\\vspace\{[^}]*\}/g, '\n');

  // Remove remaining environments (keep content)
  t = t.replace(/\\begin\{(?:itemize|enumerate|description|rSection|rSubsection)[^}]*\}/g, '');
  t = t.replace(/\\end\{[^}]*\}/g, '');
  t = t.replace(/\\begin\{[^}]*\}/g, '');

  // Remove remaining commands
  t = t.replace(/\\[a-zA-Z]+\*?\{([^}]*)\}/g, '$1'); // \cmd{content} → content
  t = t.replace(/\\[a-zA-Z]+\[[^\]]*\]\{([^}]*)\}/g, '$1');
  t = t.replace(/\\[a-zA-Z]+(?:\[[^\]]*\])?/g, ' ');  // bare commands

  // Remove braces
  t = t.replace(/[{}]/g, '');

  // Tilde (non-breaking space)
  t = t.replace(/~/g, ' ');

  // Collapse whitespace
  t = t.replace(/\n{3,}/g, '\n\n');
  t = t.replace(/[ \t]+/g, ' ');
  t = t.split('\n').map(l => l.trim()).join('\n');

  return t.trim();
}

// ── LaTeX → HTML renderer (for preview) ──────────────────────────────────────
export function latexToHtml(body: string, style: ResumeStyle): string {
  let t = body;

  const esc = (s: string) => s
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // Comments
  t = t.replace(/%[^\n]*/g, '');

  // ── Personal info block ──
  let nameHtml = '';
  const nameMatch = t.match(/\\name\{([^}]*)\}\{([^}]*)\}/);
  if (nameMatch) {
    nameHtml = `<h1 class="resume-name">${esc(nameMatch[1])} ${esc(nameMatch[2])}</h1>`;
    t = t.replace(nameMatch[0], '');
  }

  const contactItems: string[] = [];
  const contactPatterns = [
    /\\(?:phone|mobile)\[[^\]]*\]\{([^}]+)\}/g,
    /\\email\{([^}]+)\}/g,
    /\\homepage\{([^}]+)\}/g,
    /\\linkedin\[[^\]]*\]\{([^}]+)\}/g,
    /\\social\[[^\]]*\]\{([^}]+)\}/g,
    /\\address\{([^}]+)\}/g,
    /\\location\{([^}]+)\}/g,
  ];
  for (const pat of contactPatterns) {
    t = t.replace(pat, (_, c) => { contactItems.push(esc(c)); return ''; });
  }
  // Also strip \extrainfo, \position
  t = t.replace(/\\(?:position|extrainfo)\{([^}]*)\}/g, (_, c) => { contactItems.push(esc(c)); return ''; });

  const contactHtml = contactItems.length
    ? `<div class="resume-contact">${contactItems.join(' &nbsp;·&nbsp; ')}</div>`
    : '';

  // ── Text formatting ──
  t = t.replace(/\\textbf\{([^}]*)\}/g, '<strong>$1</strong>');
  t = t.replace(/\\(?:textit|emph)\{([^}]*)\}/g, '<em>$1</em>');
  t = t.replace(/\\texttt\{([^}]*)\}/g, '<code>$1</code>');
  t = t.replace(/\\underline\{([^}]*)\}/g, '<u>$1</u>');
  t = t.replace(/\\href\{([^}]*)\}\{([^}]*)\}/g, '<a href="$1">$2</a>');
  t = t.replace(/\\textcolor\{[^}]*\}\{([^}]*)\}/g, '$1');
  t = t.replace(/\\color\{[^}]*\}/g, '');

  // ── Section headings ──
  t = t.replace(/\\(?:section|cvsection)\*?\{([^}]*)\}/g,
    (_, h) => `\n<h2 class="resume-section">${esc(h)}</h2>\n`);
  t = t.replace(/\\(?:subsection|cvsubsection)\*?\{([^}]*)\}/g,
    (_, h) => `\n<h3 class="resume-sub">${esc(h)}</h3>\n`);
  // rSection (res.cls)
  t = t.replace(/\\begin\{rSection\}\{([^}]*)\}/g,
    (_, h) => `\n<h2 class="resume-section">${esc(h)}</h2>\n`);
  t = t.replace(/\\end\{rSection\}/g, '');
  t = t.replace(/\\begin\{rSubsection\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}/g,
    (_, co, ro, dt, _lo) => `<div class="resume-job"><strong>${esc(co)}</strong> &ndash; ${esc(ro)} <span class="resume-date">${esc(dt)}</span></div>`);
  t = t.replace(/\\end\{rSubsection\}/g, '');

  // ── moderncv entries ──
  t = t.replace(
    /\\cventry\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}\{[^}]*\}\{([^}]*)\}/g,
    (_, date, role, org, __loc, desc) =>
      `<div class="resume-job"><strong>${esc(role)}</strong>, ${esc(org)} <span class="resume-date">${esc(date)}</span>${desc ? `<div class="resume-desc">${desc}</div>` : ''}</div>`
  );
  t = t.replace(/\\cvitem\{([^}]*)\}\{([^}]*)\}/g,
    (_, label, val) => `<div class="resume-item"><strong>${esc(label)}:</strong> ${val}</div>`);
  t = t.replace(/\\cvlistitem\{([^}]*)\}/g, '<li>$1</li>');

  // ── Lists ──
  t = t.replace(/\\begin\{itemize\}/g, '<ul>');
  t = t.replace(/\\end\{itemize\}/g, '</ul>');
  t = t.replace(/\\begin\{enumerate\}/g, '<ol>');
  t = t.replace(/\\end\{enumerate\}/g, '</ol>');
  t = t.replace(/\\item\s*\[([^\]]*)\]/g, '<li><strong>$1</strong> ');
  t = t.replace(/\\item\s*/g, '<li>');

  // ── Line breaks ──
  t = t.replace(/\\\\/g, '<br>');
  t = t.replace(/\\newline\b/g, '<br>');
  t = t.replace(/\\(?:medskip|smallskip|bigskip)\b/g, '<div style="margin:4pt 0"></div>');
  t = t.replace(/\\vspace\{[^}]*\}/g, '');
  t = t.replace(/\\hspace\{[^}]*\}/g, '&ensp;');
  t = t.replace(/\\noindent\b/g, '');
  t = t.replace(/\\par\b/g, '</p><p>');

  // ── Remaining environments ──
  t = t.replace(/\\begin\{(?:center|flushleft|flushright)\}/g, '');
  t = t.replace(/\\end\{(?:center|flushleft|flushright)\}/g, '');
  t = t.replace(/\\begin\{[^}]+\}/g, '');
  t = t.replace(/\\end\{[^}]+\}/g, '');

  // ── Remaining commands ──
  t = t.replace(/\\[a-zA-Z]+\*?\{([^}]*)\}/g, '$1');
  t = t.replace(/\\[a-zA-Z]+\[[^\]]*\]\{([^}]*)\}/g, '$1');
  t = t.replace(/\\[a-zA-Z]+(?:\[[^\]]*\])?\s*/g, ' ');

  // ── Cleanup ──
  t = t.replace(/[{}]/g, '');
  t = t.replace(/~/g, '&nbsp;');
  t = t.replace(/---/g, '&mdash;').replace(/--/g, '&ndash;');

  // Wrap bare paragraphs
  const body2 = t.split(/\n{2,}/)
    .map(p => {
      p = p.trim();
      if (!p) return '';
      if (/^<[huldop]/.test(p)) return p;
      return `<p>${p}</p>`;
    })
    .filter(Boolean)
    .join('\n');

  const f = `'${style.fontFamily}', ${/serif/.test(style.fontFamily) || /times|georgia|palatino|garamond/i.test(style.fontFamily) ? 'Georgia, serif' : "'Segoe UI', Arial, sans-serif"}`;
  const hc = style.headingColor.startsWith('#') ? style.headingColor : `#${style.headingColor}`;

  const css = `
    body { font-family:${f}; font-size:${style.bodyFontSize}pt; color:#1a1a1a; line-height:${style.lineHeight}; }
    h1.resume-name { font-size:${style.nameFontSize}pt; font-weight:700; text-align:center; margin:0 0 4pt; }
    div.resume-contact { text-align:center; font-size:${style.bodyFontSize - 1}pt; color:#555; margin-bottom:10pt; }
    h2.resume-section {
      font-size:${style.headingFontSize}pt; font-weight:${style.headingBold ? 700 : 600};
      text-transform:${style.headingUppercase ? 'uppercase' : 'none'};
      color:${hc}; border-bottom:0.75pt solid #aaa;
      padding-bottom:2pt; margin:10pt 0 4pt;
    }
    h3.resume-sub { font-size:${style.bodyFontSize + 0.5}pt; font-weight:600; color:#333; margin:6pt 0 2pt; }
    p, div.resume-item { margin:1pt 0; font-size:${style.bodyFontSize}pt; }
    ul, ol { margin:2pt 0 2pt 14pt; padding:0; }
    li { margin-bottom:1.5pt; font-size:${style.bodyFontSize}pt; }
    .resume-job { margin:3pt 0; }
    .resume-date { float:right; color:#555; font-size:${style.bodyFontSize - 0.5}pt; }
    strong { font-weight:600; }
    code { font-family:monospace; font-size:${style.bodyFontSize - 1}pt; }
    a { color:${hc}; text-decoration:none; }
  `;

  return `
    <style>${css}</style>
    ${nameHtml}
    ${contactHtml}
    ${body2}
  `.trim();
}

// ── Full parse entry point ────────────────────────────────────────────────────
export function parseLatex(source: string): LatexParseResult {
  // Split preamble / body
  const bodyMatch = source.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
  const body      = bodyMatch?.[1]?.trim() ?? source;
  const preamble  = source.slice(0, source.indexOf('\\begin{document}') || 0);

  const style     = detectLatexStyle(preamble || source);
  const plainText = latexToPlainText(body);
  const html      = latexToHtml(body, style);

  // ── Detect name + contact from body ──
  let name = '';
  const nameMatch = body.match(/\\name\{([^}]*)\}\{([^}]*)\}/);
  if (nameMatch) name = `${nameMatch[1]} ${nameMatch[2]}`.trim();
  if (!name) {
    // Fallback: first non-empty plain line
    const firstLine = plainText.split('\n').find(l => l.trim().length > 2 && l.trim().length < 60);
    name = firstLine?.trim() ?? '';
  }

  const contactLines: string[] = [];
  const contactRe = /\\(?:phone|mobile|email|homepage|address|social|linkedin)\[[^\]]*\]\{([^}]+)\}|\\email\{([^}]+)\}/g;
  let cm: RegExpExecArray | null;
  while ((cm = contactRe.exec(body)) !== null) {
    contactLines.push(cm[1] ?? cm[2] ?? '');
  }

  // ── Section extraction ──
  const sectionRe = /\\(?:section|cvsection|begin\{rSection\})\*?\{([^}]*)\}/g;
  const sectionPositions: Array<{ heading: string; pos: number }> = [];
  let sm: RegExpExecArray | null;
  while ((sm = sectionRe.exec(body)) !== null) {
    sectionPositions.push({ heading: sm[1], pos: sm.index });
  }

  const sections: LatexSection[] = sectionPositions.map((sp, i) => {
    const endPos   = i + 1 < sectionPositions.length ? sectionPositions[i + 1].pos : body.length;
    const latex    = body.slice(sp.pos, endPos);
    const plain    = latexToPlainText(latex);
    return { heading: sp.heading, startPos: sp.pos, endPos, latexContent: latex, plainText: plain };
  });

  return { preamble, body, plainText, html, style, sections, name, contactLines };
}

// ── Inject tailored sections back into LaTeX source ───────────────────────────
/**
 * The AI is asked to return the tailored section in LaTeX format.
 * This function replaces the original section content in the source.
 */
export function injectTailoredLatex(
  originalSource: string,
  originalSection: LatexSection,
  tailoredLatex: string
): string {
  // Replace the section block in the full source
  const before = originalSource.slice(0, originalSection.startPos);
  const after  = originalSource.slice(originalSection.endPos);
  return before + tailoredLatex + after;
}
