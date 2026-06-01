export interface ParsedResume {
  experience: string | null;
  projects: string | null;
  skills: string | null;
  atsReady: boolean;
  sectionMap: Array<{ name: string; start: number; end: number; content: string }>;
}

const SECTION_PATTERNS: Record<string, RegExp> = {
  experience: /^(work\s+)?experience|professional\s+experience|employment(\s+history)?|work\s+history/i,
  projects: /^(personal\s+|key\s+|academic\s+|relevant\s+)?projects?/i,
  skills: /^(technical\s+|core\s+|key\s+)?skills?|competenc(y|ies)|technologies/i,
};

const ALL_KNOWN_SECTIONS = /^(education|certifications?|awards?|publications?|volunteer|summary|objective|profile|about|contact|references?|languages?|interests?|hobbies|activities)/i;

function isHeader(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Header if: short line (≤50 chars), ends with optional colon, no bullet, not all lower
  if (trimmed.length > 60) return false;
  if (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('*')) return false;
  const words = trimmed.split(/\s+/);
  // At least one capitalized word
  const hasCap = words.some(w => /^[A-Z]/.test(w));
  return hasCap && words.length <= 6;
}

export function parseResume(text: string): ParsedResume {
  const lines = text.split('\n');
  const sectionMap: Array<{ name: string; start: number; end: number; content: string }> = [];

  let currentSection: string | null = null;
  let currentStart = 0;
  let currentLines: string[] = [];

  const flushSection = (endIdx: number) => {
    if (currentSection !== null) {
      sectionMap.push({
        name: currentSection,
        start: currentStart,
        end: endIdx,
        content: currentLines.join('\n'),
      });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (isHeader(trimmed)) {
      let matched: string | null = null;
      for (const [key, pattern] of Object.entries(SECTION_PATTERNS)) {
        if (pattern.test(trimmed.replace(/:$/, ''))) {
          matched = key;
          break;
        }
      }
      if (!matched && ALL_KNOWN_SECTIONS.test(trimmed.replace(/:$/, ''))) {
        matched = trimmed.toLowerCase().replace(/:$/, '').replace(/\s+/g, '_');
      }
      if (matched) {
        flushSection(i);
        currentSection = matched;
        currentStart = i;
        currentLines = [line];
        continue;
      }
    }

    if (currentSection !== null) {
      currentLines.push(line);
    }
  }
  flushSection(lines.length);

  const find = (key: string) => sectionMap.find(s => s.name === key)?.content ?? null;

  const experience = find('experience');
  const projects = find('projects');
  const skills = find('skills');
  const atsReady = experience !== null || projects !== null;

  return { experience, projects, skills, atsReady, sectionMap };
}

export function spliceEnhancedSections(
  original: string,
  enhanced: string,
  parsed: ParsedResume
): string {
  // The AI returns enhanced experience + projects blocks.
  // We find the original blocks and replace them.
  const targets = parsed.sectionMap.filter(s => s.name === 'experience' || s.name === 'projects');
  if (targets.length === 0) return enhanced; // fallback: return AI output as-is

  // Sort by position descending so splicing doesn't shift indices
  const sorted = [...targets].sort((a, b) => b.start - a.start);

  const lines = original.split('\n');
  const enhancedSections = parseResume(enhanced);

  for (const target of sorted) {
    const enhancedContent =
      target.name === 'experience'
        ? enhancedSections.experience
        : enhancedSections.projects;

    if (!enhancedContent) continue;

    // Replace lines[target.start..target.end] with enhancedContent lines
    const replacement = enhancedContent.split('\n');
    lines.splice(target.start, target.end - target.start, ...replacement);
  }

  return lines.join('\n');
}
