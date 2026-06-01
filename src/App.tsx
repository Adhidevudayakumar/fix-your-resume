import { useState, useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import Header from './components/Header';
import ApiConfig from './components/ApiConfig';
import InputPanel from './components/InputPanel';
import OutputPanel from './components/OutputPanel';
import AtsWarning from './components/AtsWarning';
import KeywordBadges from './components/KeywordBadges';
import { parseResume } from './lib/resume-parser';
import { extractJDKeywords } from './lib/jd-extractor';
import { buildLatexUserMessage, LATEX_SYSTEM_PROMPT, estimateTokens } from './lib/prompt';
import { callProvider } from './lib/providers';
import { computeDiff, type DiffToken } from './lib/diff';
import { DEFAULT_STYLE } from './lib/resume-style';
import { parseLatex, latexToHtml, type LatexParseResult } from './lib/latex-parser';
import type { ProviderConfig } from './lib/providers';

const DEFAULT_CONFIG: ProviderConfig = { provider: 'claude', apiKey: '', model: '' };

// Which LaTeX sections to send to the AI
const TARGET_SECTIONS = new Set([
  'experience','work experience','professional experience','employment',
  'projects','personal projects','key projects','relevant projects',
]);

export default function App() {
  const [jd, setJd]                             = useState('');
  const [latexSource, setLatexSource]           = useState('');
  const [latexParsed, setLatexParsed]           = useState<LatexParseResult | null>(null);
  const [config, setConfig]                     = useState<ProviderConfig>(DEFAULT_CONFIG);
  const [_tailoredLatex, setTailoredLatex]      = useState<string | null>(null);
  const [tailoredPlain, setTailoredPlain]       = useState<string | null>(null);
  const [tailoredHtml, setTailoredHtml]         = useState<string | null>(null);
  const [diff, setDiff]                         = useState<DiffToken[] | null>(null);
  const [loading, setLoading]                   = useState(false);
  const [error, setError]                       = useState<string | null>(null);
  const [forceFull, setForceFull]               = useState(false);

  const resumeStyle = latexParsed?.style ?? DEFAULT_STYLE;

  const keywords = useMemo(() => (jd.trim() ? extractJDKeywords(jd) : []), [jd]);

  // Sections to tailor (Experience + Projects)
  const targetSections = useMemo(() => {
    if (!latexParsed) return [];
    return latexParsed.sections.filter(s =>
      TARGET_SECTIONS.has(s.heading.toLowerCase().trim())
    );
  }, [latexParsed]);

  const tokenEstimate = useMemo(() => {
    if (!targetSections.length || !keywords.length) return 0;
    const msg = buildLatexUserMessage(keywords, targetSections);
    return estimateTokens(msg) + 150;
  }, [targetSections, keywords]);

  const matchedKeywords = useMemo(() => {
    if (!tailoredPlain) return new Set<string>();
    const lower = tailoredPlain.toLowerCase();
    return new Set(keywords.filter(k => lower.includes(k.toLowerCase())));
  }, [tailoredPlain, keywords]);

  // ATS check on the plain text
  const parsedResumeSections = useMemo(() =>
    latexParsed ? parseResume(latexParsed.plainText) : null,
    [latexParsed]
  );

  const canTailor =
    jd.trim().length > 0 &&
    latexSource.trim().length > 0 &&
    (config.apiKey.trim().length > 0 || config.provider === 'local');

  const handleLatexChange = (source: string, parsed: LatexParseResult) => {
    setLatexSource(source);
    setLatexParsed(parsed);
    setTailoredLatex(null);
    setTailoredPlain(null);
    setTailoredHtml(null);
    setDiff(null);
    setForceFull(false);
  };

  const tailor = async (fullMode = false) => {
    if (!latexParsed || !jd.trim()) return;
    setError(null);
    setLoading(true);
    setTailoredLatex(null);
    setTailoredPlain(null);
    setTailoredHtml(null);
    setDiff(null);

    try {
      const sectionsToSend = fullMode
        ? latexParsed.sections
        : targetSections.length > 0 ? targetSections : latexParsed.sections;

      const userMessage = sectionsToSend.length > 0
        ? buildLatexUserMessage(keywords, sectionsToSend)
        : `TARGET KEYWORDS: ${keywords.join(', ')}\n\nFULL LATEX RESUME:\n${latexParsed.body}`;

      // Override system prompt to LaTeX mode
      const result = await callProvider(userMessage, {
        ...config,
        model: config.model || undefined,
        _systemPromptOverride: LATEX_SYSTEM_PROMPT,
      } as any);

      // Splice the AI's returned LaTeX back into the original source
      let newLatexSource = latexSource;
      if (sectionsToSend.length > 0 && !fullMode) {
        // Replace each section in reverse order (to keep positions stable)
        // Process sections sorted by position ascending
        // The AI returns all sections together — try to split by section comment markers
        let remaining = result;
        for (const sec of [...sectionsToSend].sort((a, b) => a.startPos - b.startPos)) {
          const marker = `% === ${sec.heading} ===`;
          const nextMarker = sectionsToSend.find(s => s.startPos > sec.startPos);
          const nextMark = nextMarker ? `% === ${nextMarker.heading} ===` : null;
          const idx = remaining.indexOf(marker);
          if (idx !== -1) {
            const endIdx = nextMark ? remaining.indexOf(nextMark, idx) : remaining.length;
            const sectionResult = remaining.slice(idx + marker.length, endIdx === -1 ? undefined : endIdx).trim();
            newLatexSource = newLatexSource.slice(0, sec.startPos) + sectionResult + newLatexSource.slice(sec.endPos);
          }
        }
      } else {
        // Full mode — replace the entire body
        newLatexSource = latexSource.replace(
          /\\begin\{document\}[\s\S]*?\\end\{document\}/,
          `\\begin{document}\n${result}\n\\end{document}`
        );
      }

      // Re-parse the new LaTeX source
      const newParsed = parseLatex(newLatexSource);
      const newPlain  = newParsed.plainText;
      const newHtml   = latexToHtml(newParsed.body, resumeStyle);

      setTailoredLatex(newLatexSource);
      setTailoredPlain(newPlain);
      setTailoredHtml(newHtml);
      setDiff(computeDiff(latexParsed.plainText, newPlain));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleTailorAnyway = () => { setForceFull(true); tailor(true); };

  // For edit mode — when user edits the tailored plain text,
  // update the plain + diff (LaTeX source stays unchanged until re-tailor)
  const handleTailoredChange = (v: string) => {
    setTailoredPlain(v);
    setDiff(computeDiff(latexParsed?.plainText ?? '', v));
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-6 items-start">

          {/* Left */}
          <div className="space-y-4">
            <InputPanel
              jd={jd}
              latexSource={latexSource}
              parsed={latexParsed}
              onJdChange={setJd}
              onLatexChange={handleLatexChange}
            />

            {keywords.length > 0 && (
              <KeywordBadges keywords={keywords} matched={matchedKeywords} />
            )}

            {parsedResumeSections && !forceFull && (
              <AtsWarning
                atsReady={parsedResumeSections.atsReady}
                onTailorAnyway={!parsedResumeSections.atsReady ? handleTailorAnyway : undefined}
              />
            )}

            <ApiConfig config={config} onChange={setConfig} />

            {tokenEstimate > 0 && !forceFull && (
              <p className="text-xs text-gray-600 text-center">
                ~{tokenEstimate} tokens · sending {targetSections.length > 0 ? `${targetSections.length} section(s)` : 'full resume'}
              </p>
            )}

            <button
              onClick={() => tailor(false)}
              disabled={!canTailor || loading}
              className={`w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-sm transition-all
                ${canTailor && !loading
                  ? 'bg-green-500 hover:bg-green-400 text-gray-950 shadow-lg shadow-green-500/20 cursor-pointer'
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}
            >
              <Sparkles size={16} />
              {loading ? 'Tailoring…' : 'Tailor My Resume'}
            </button>

            {!config.apiKey.trim() && config.provider !== 'local' && (
              <p className="text-xs text-center text-gray-600">Add your API key above to enable tailoring</p>
            )}
          </div>

          {/* Right */}
          <div className="lg:sticky lg:top-6">
            <OutputPanel
              original={latexParsed?.plainText ?? null}
              originalHtml={latexParsed?.html ?? null}
              resumeStyle={resumeStyle}
              tailored={tailoredPlain}
              tailoredHtml={tailoredHtml}
              diff={diff}
              loading={loading}
              error={error}
              tokenEstimate={tokenEstimate}
              onTailoredChange={handleTailoredChange}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
