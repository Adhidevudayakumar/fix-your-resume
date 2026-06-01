import { useRef, useState, useEffect, useCallback } from 'react';
import { Upload, Eye, Code2 } from 'lucide-react';
import { parseLatex, type LatexParseResult } from '../lib/latex-parser';

const LATEX_PLACEHOLDER = `% Paste your LaTeX resume source here
% Supported: moderncv, awesome-cv, Jake's template, res.cls, plain article, etc.

\\documentclass[11pt]{article}
\\usepackage{times}

\\begin{document}

\\begin{center}
  {\\Large \\textbf{Your Name}} \\\\
  email@example.com | +1-555-000-0000 | linkedin.com/in/yourname
\\end{center}

\\section{Experience}
\\textbf{Senior Engineer} at \\textit{Company Inc.} \\hfill 2021--Present
\\begin{itemize}
  \\item Built scalable REST APIs serving 10M+ requests/day
  \\item Led migration of monolith to microservices architecture
\\end{itemize}

\\section{Projects}
\\textbf{Open Source Tool} \\hfill 2022
\\begin{itemize}
  \\item Developed a CLI tool used by 2000+ developers worldwide
\\end{itemize}

\\end{document}`;

interface Props {
  jd:             string;
  latexSource:    string;
  parsed:         LatexParseResult | null;
  onJdChange:     (v: string) => void;
  onLatexChange:  (source: string, parsed: LatexParseResult) => void;
}

export default function InputPanel({
  jd, latexSource, parsed, onJdChange, onLatexChange,
}: Props) {
  const fileRef                          = useRef<HTMLInputElement>(null);
  const [showPreview, setShowPreview]    = useState(false);
  const [parseError, setParseError]      = useState<string | null>(null);

  // Debounce parse
  useEffect(() => {
    if (!latexSource.trim()) return;
    const t = setTimeout(() => {
      try {
        const result = parseLatex(latexSource);
        setParseError(null);
        onLatexChange(latexSource, result);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : 'Parse error');
      }
    }, 400);
    return () => clearTimeout(t);
  }, [latexSource]);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const text = await file.text();
    try {
      const result = parseLatex(text);
      setParseError(null);
      onLatexChange(text, result);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse file');
    }
  }, []);

  const styleInfo = parsed?.style;

  return (
    <div className="space-y-4">

      {/* Job Description */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Job Description
        </label>
        <textarea
          value={jd}
          onChange={e => onJdChange(e.target.value)}
          placeholder="Paste the full job description here…"
          rows={9}
          className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-green-500/50 leading-relaxed"
        />
        {jd && <p className="text-xs text-gray-600 text-right">~{Math.ceil(jd.length / 4)} tokens</p>}
      </div>

      {/* LaTeX Resume */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Resume (LaTeX)
            </label>
            {styleInfo && styleInfo.source !== 'default' && (
              <span className="text-[10px] bg-green-400/10 text-green-400 border border-green-400/20 px-2 py-0.5 rounded-full">
                {styleInfo.fontFamily.split(',')[0]} · {styleInfo.bodyFontSize}pt
                {styleInfo.headingColor !== DEFAULT_HEADING_COLOR && (
                  <>
                    &nbsp;·&nbsp;
                    <span
                      className="inline-block w-2 h-2 rounded-full align-middle mr-0.5"
                      style={{ background: `#${styleInfo.headingColor}` }}
                    />
                  </>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              title="Upload .tex file"
            >
              <Upload size={12} /> .tex
            </button>
            <button
              onClick={() => setShowPreview(p => !p)}
              disabled={!parsed}
              className={`flex items-center gap-1.5 text-xs transition-colors px-2 py-1 rounded-md
                ${parsed ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-700 cursor-not-allowed'}`}
              title="Toggle preview"
            >
              {showPreview ? <><Code2 size={12} /> Source</> : <><Eye size={12} /> Preview</>}
            </button>
            <input ref={fileRef} type="file" accept=".tex,.txt" onChange={handleFile} className="hidden" />
          </div>
        </div>

        {showPreview && parsed ? (
          /* ── Rendered HTML preview ── */
          <div
            className="w-full min-h-64 bg-white rounded-xl p-4 overflow-auto text-gray-900 border border-gray-700"
            style={{ maxHeight: '480px' }}
            dangerouslySetInnerHTML={{ __html: parsed.html }}
          />
        ) : (
          /* ── Raw LaTeX editor ── */
          <textarea
            value={latexSource}
            onChange={e => {
              const val = e.target.value;
              try { onLatexChange(val, parseLatex(val)); } catch { /* debounced separately */ }
            }}
            placeholder={LATEX_PLACEHOLDER}
            rows={20}
            spellCheck={false}
            className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-green-300 placeholder-gray-700 focus:outline-none focus:border-green-500/40 font-mono leading-relaxed"
          />
        )}

        {parseError && (
          <p className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2">
            ⚠ {parseError}
          </p>
        )}

        {parsed && (
          <p className="text-xs text-gray-600 flex gap-3">
            <span>~{Math.ceil(parsed.plainText.length / 4)} tokens (extracted text)</span>
            {parsed.sections.length > 0 && (
              <span className="text-gray-700">
                sections: {parsed.sections.map(s => s.heading).join(', ')}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

const DEFAULT_HEADING_COLOR = '111111';
