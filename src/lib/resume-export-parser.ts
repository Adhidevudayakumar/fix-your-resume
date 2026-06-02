/**
 * Parses plain-text resume into a structured format suitable for PDF/DOCX export.
 * Designed to preserve ATS discoverability — clean reading order, no lossy transforms.
 */

export type LineType = 'name' | 'contact' | 'section_heading' | 'bullet' | 'sub_bullet' | 'text' | 'blank';

export interface ResumeLine {
  type: LineType;
  text: string;
  indent: number;
}

export interface ResumeBlock {
  heading: string | null;      // section heading, null for header block
  lines: ResumeLine[];
}

export interface StructuredResume {
  name: string;
  contactLines: string[];
  blocks: ResumeBlock[];       // each section as a block
  rawLines: ResumeLine[];      // flat line list for simple renderers
}

// ── Patterns ──────────────────────────────────────────────────────────────────
export const SECTION_HEADINGS = new Set([
  'experience','work experience','professional experience','employment history','work history',
  'projects','personal projects','key projects','academic projects','relevant projects',
  'education','academic background','qualifications',
  'skills','technical skills','core competencies','technologies','tools',
  'certifications','licenses','awards','achievements','honors',
  'summary','professional summary','objective','career objective','profile','about',
  'publications','research','volunteer','extracurricular','activities','interests',
  'languages','references','contact',
]);

const BULLET_RE   = /^(\s*)([-•*▪◦▸►→]|\d+[.)]\s)/;
const CONTACT_RE  = /[@|linkedin|github|http|tel:|phone|\+\d|\.com]/i;

function detectType(line: string, lineIndex: number): LineType {
  const trimmed = line.trim();
  if (!trimmed) return 'blank';

  const indent = line.length - line.trimStart().length;

  // Bullet
  if (BULLET_RE.test(line)) return indent > 4 ? 'sub_bullet' : 'bullet';

  // Sub-bullet by indent alone (≥4 spaces / 1 tab indent for non-bullet text)
  if (indent >= 4) return 'sub_bullet';

  // Section heading — short, no punctuation at end except colon
  const cleaned = trimmed.replace(/:$/, '').toLowerCase();
  if (SECTION_HEADINGS.has(cleaned)) return 'section_heading';

  // Name: first non-blank line, no contact markers, reasonably short
  if (lineIndex === 0 && !CONTACT_RE.test(trimmed) && trimmed.length < 60) return 'name';

  // Contact line
  if (CONTACT_RE.test(trimmed) && trimmed.length < 120) return 'contact';

  // Generic text
  return 'text';
}

export function parseResumeForExport(text: string): StructuredResume {
  const rawText = text.trim();
  const lines   = rawText.split('\n');

  // First pass: classify every line
  const rawLines: ResumeLine[] = [];
  let firstNonBlank = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() && firstNonBlank < 0) firstNonBlank = i;
    const adjustedIdx = firstNonBlank < 0 ? i : i - firstNonBlank;
    const type = detectType(lines[i], adjustedIdx);
    const indent = lines[i].length - lines[i].trimStart().length;
    rawLines.push({ type, text: lines[i].trim(), indent });
  }

  // Extract name and contact block (everything before first section_heading)
  let name = '';
  const contactLines: string[] = [];
  let firstSectionIdx = rawLines.findIndex(l => l.type === 'section_heading');
  if (firstSectionIdx < 0) firstSectionIdx = rawLines.length;

  for (let i = 0; i < firstSectionIdx; i++) {
    const l = rawLines[i];
    if (l.type === 'blank') continue;
    if (l.type === 'name' && !name) { name = l.text; continue; }
    if (!name && l.text && !CONTACT_RE.test(l.text)) { name = l.text; continue; }
    if (l.text) contactLines.push(l.text);
  }

  // Second pass: group into section blocks
  const blocks: ResumeBlock[] = [];
  let currentHeading: string | null = null;
  let currentLines: ResumeLine[]    = [];

  const flushBlock = () => {
    // Trim trailing blanks
    while (currentLines.length && currentLines[currentLines.length - 1].type === 'blank') {
      currentLines.pop();
    }
    if (currentHeading !== null || currentLines.length > 0) {
      blocks.push({ heading: currentHeading, lines: currentLines });
    }
    currentHeading = null;
    currentLines   = [];
  };

  for (let i = firstSectionIdx; i < rawLines.length; i++) {
    const l = rawLines[i];
    if (l.type === 'section_heading') {
      flushBlock();
      currentHeading = l.text.replace(/:$/, '');
    } else {
      currentLines.push(l);
    }
  }
  flushBlock();

  return { name, contactLines, blocks, rawLines };
}
