// ── Plain-text mode ───────────────────────────────────────────────────────────
export const SYSTEM_PROMPT = `You are an expert ATS resume optimizer.

You receive extracted resume sections (Experience and/or Projects) and a keyword list derived from a job description.

Your task:
- Rewrite ONLY the provided sections, naturally embedding the relevant keywords into existing bullet points where they genuinely fit the context.
- NEVER invent new experiences, job titles, companies, dates, metrics, or skills that are not already in the original.
- Preserve ALL formatting: bullet symbols (-, •, *), indentation, section headers, and line breaks exactly.
- Only include a keyword if it fits naturally in context. Skip keywords that don't fit.
- Return ONLY the rewritten sections with their original headers. No explanation, no preamble, no commentary.`;

// ── LaTeX mode ────────────────────────────────────────────────────────────────
export const LATEX_SYSTEM_PROMPT = `You are an expert ATS resume optimizer who understands LaTeX.

You receive LaTeX resume sections (Experience and/or Projects) and a keyword list from a job description.

Your task:
- Rewrite ONLY the provided LaTeX sections, naturally embedding the relevant keywords into existing \\item bullet points where they genuinely fit.
- CRITICAL: Preserve ALL LaTeX commands exactly — \\item, \\textbf{}, \\emph{}, \\begin{}, \\end{}, \\cventry{}, custom macros, etc.
- Only modify the human-readable TEXT inside the LaTeX commands, never the commands themselves.
- NEVER invent new experiences, dates, companies, job titles, or metrics.
- Only include a keyword if it fits naturally. Skip those that don't.
- Return ONLY the rewritten LaTeX sections. No explanation, no markdown, no commentary.`;

export function buildUserMessage(
  keywords: string[],
  experience: string | null,
  projects: string | null
): string {
  const parts: string[] = [`TARGET KEYWORDS: ${keywords.join(', ')}`, ''];
  if (experience) { parts.push(experience.trim()); parts.push(''); }
  if (projects)   { parts.push(projects.trim()); }
  return parts.join('\n').trim();
}

export function buildLatexUserMessage(
  keywords: string[],
  sections: Array<{ heading: string; latexContent: string }>
): string {
  const parts: string[] = [`TARGET KEYWORDS: ${keywords.join(', ')}`, ''];
  for (const s of sections) {
    parts.push(`% === ${s.heading} ===`);
    parts.push(s.latexContent.trim());
    parts.push('');
  }
  return parts.join('\n').trim();
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
