import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Copy, Download, Check, Loader2, Undo2, RotateCcw,
  Pencil, X, Save, ChevronDown, FileText, FileType2, AlignLeft,
} from 'lucide-react';
import type { DiffToken } from '../lib/diff';
import { computeDiff } from '../lib/diff';
import { parseResumeForExport, SECTION_HEADINGS } from '../lib/resume-export-parser';
import { buildResumePreviewHtml } from '../lib/resume-preview';
import { downloadAsPDF } from '../lib/export-pdf';
import { downloadAsDOCX } from '../lib/export-docx';
import type { ResumeStyle } from '../lib/resume-style';

type Tab = 'original' | 'tailored' | 'diff';

// ── Hunk model ────────────────────────────────────────────────────────────────
interface DiffHunk {
  id: number;
  type: 'same' | 'added' | 'removed';
  text: string;
}

function groupHunks(tokens: DiffToken[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let id = 0;
  for (const token of tokens) {
    const last = hunks[hunks.length - 1];
    if (last && last.type === token.type) {
      last.text += token.text;
    } else {
      hunks.push({ id: id++, type: token.type, text: token.text });
    }
  }
  return hunks;
}

/**
 * Reconstruct text from the ORIGINAL (locked) hunk list + a set of reverted hunk IDs.
 * - 'same'    → always included
 * - 'added'   → included unless reverted
 * - 'removed' → included only if reverted (i.e. "restored")
 */
function reconstructFromHunks(hunks: DiffHunk[], reverted: Set<number>): string {
  return hunks
    .filter(h => {
      if (h.type === 'same')    return true;
      if (h.type === 'added')   return !reverted.has(h.id);
      if (h.type === 'removed') return reverted.has(h.id);
      return true;
    })
    .map(h => h.text)
    .join('');
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  original: string | null;         // plain text (for diff)
  originalHtml: string | null;     // rendered LaTeX HTML (for Original preview tab)
  resumeStyle: ResumeStyle;
  tailored: string | null;         // tailored plain text
  tailoredHtml: string | null;     // rendered tailored LaTeX HTML (if available)
  diff: DiffToken[] | null;
  loading: boolean;
  error: string | null;
  tokenEstimate: number;
  onTailoredChange: (v: string) => void;
}

export default function OutputPanel({
  original, originalHtml, resumeStyle, tailored, tailoredHtml, diff,
  loading, error, tokenEstimate, onTailoredChange,
}: Props) {
  const [tab, setTab]               = useState<Tab>('tailored');
  const [copied, setCopied]         = useState(false);
  const [editMode, setEditMode]     = useState(false);
  const [editDraft, setEditDraft]   = useState('');
  const [editSaved, setEditSaved]   = useState(false);
  const [reverted, setReverted]     = useState<Set<number>>(new Set());
  const [dlOpen, setDlOpen]         = useState(false);
  const [dlLoading, setDlLoading]   = useState<'pdf'|'docx'|null>(null);
  const [showPlainText, setShowPlainText] = useState(false);
  const [livePreviewHtml, setLivePreviewHtml] = useState('');
  const textareaRef                 = useRef<HTMLTextAreaElement>(null);
  const dlRef                       = useRef<HTMLDivElement>(null);

  // ── Lock initial hunks once per tailoring run ─────────────────────────────
  const initialHunks = useMemo(
    () => (diff ? groupHunks(diff) : []),
    [diff],
  );

  // Reset all local state whenever a fresh tailor run arrives
  useEffect(() => {
    setReverted(new Set());
    setEditMode(false);
    setEditDraft(tailored ?? '');
    setLivePreviewHtml('');
    setShowPlainText(false);
  }, [diff, tailored]);

  // Close download dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dlRef.current && !dlRef.current.contains(e.target as Node)) setDlOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced live preview during edit mode (300ms — same pattern as InputPanel)
  useEffect(() => {
    if (!editMode) return;
    const t = setTimeout(() => {
      if (editDraft.trim()) {
        setLivePreviewHtml(buildResumePreviewHtml(editDraft, resumeStyle));
      }
    }, 300);
    return () => clearTimeout(t);
  }, [editDraft, editMode, resumeStyle]);

  // ── Derived text ──────────────────────────────────────────────────────────
  const baseText = useMemo(() => {
    if (!tailored) return '';
    if (reverted.size === 0) return tailored;
    return reconstructFromHunks(initialHunks, reverted);
  }, [tailored, initialHunks, reverted]);

  const displayText = editMode ? editDraft : baseText;

  // Styled HTML for view mode: use AI-generated HTML when available, otherwise build from plain text
  const viewHtml = useMemo(() => {
    if (tailoredHtml) return tailoredHtml;
    if (baseText) return buildResumePreviewHtml(baseText, resumeStyle);
    return '';
  }, [tailoredHtml, baseText, resumeStyle]);

  // ── Diff for "What Changed" tab ───────────────────────────────────────────
  const editModeDiff = useMemo(() => {
    if (!editMode || !original) return null;
    return computeDiff(original, editDraft);
  }, [editMode, original, editDraft]);

  const editModeHunks = useMemo(
    () => (editModeDiff ? groupHunks(editModeDiff) : []),
    [editModeDiff],
  );

  // ── Actions ───────────────────────────────────────────────────────────────
  const toggleRevert = (hunkId: number, _hunkType: 'added' | 'removed') => {
    setReverted(prev => {
      const next = new Set(prev);
      if (next.has(hunkId)) next.delete(hunkId);
      else next.add(hunkId);
      return next;
    });
  };

  const resetReverts = () => setReverted(new Set());

  const enterEditMode = () => {
    setEditDraft(baseText);
    setEditMode(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const saveEdit = () => {
    onTailoredChange(editDraft);
    setEditMode(false);
    setEditSaved(true);
    setTimeout(() => setEditSaved(false), 2000);
  };

  const discardEdit = () => {
    setEditDraft(baseText);
    setEditMode(false);
  };

  const handleDownload = async (format: 'pdf' | 'docx' | 'txt') => {
    if (!displayText) return;
    setDlOpen(false);
    const safeName = (r?: { name: string }) =>
      (r?.name ?? 'resume').replace(/[^a-z0-9]/gi, '_').toLowerCase();

    if (format === 'txt') {
      const blob = new Blob([displayText], { type: 'text/plain' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'resume-tailored.txt';
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    setDlLoading(format);
    try {
      const parsed = parseResumeForExport(displayText);
      const fname  = safeName(parsed);
      if (format === 'pdf')  downloadAsPDF(parsed, resumeStyle);
      if (format === 'docx') await downloadAsDOCX(parsed, fname, resumeStyle);
    } catch (e) {
      console.error('Export failed:', e);
      alert(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDlLoading(null);
    }
  };

  const copy = () => {
    if (!displayText) return;
    navigator.clipboard.writeText(displayText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const changedCount = initialHunks.filter(
    h => (h.type === 'added' || h.type === 'removed') && !reverted.has(h.id)
  ).length;

  const revertedCount = reverted.size;

  // ── Styled hunk renderer for "What Changed" tab ───────────────────────────
  // Applies resume font/heading styles inside each hunk's text, detecting section headings.
  const renderStyledHunk = (hunk: DiffHunk) => {
    const isReverted = reverted.has(hunk.id);
    const lines = hunk.text.split('\n');

    const renderedLines = lines.map((line, lineIdx) => {
      const trimmed = line.trim().toLowerCase().replace(/:$/, '');
      const isHeading = trimmed.length > 0 && SECTION_HEADINGS.has(trimmed);

      const headingStyle: React.CSSProperties = isHeading ? {
        display: 'block',
        color: `#${resumeStyle.headingColor}`,
        fontWeight: resumeStyle.headingBold ? 700 : 600,
        textTransform: resumeStyle.headingUppercase ? 'uppercase' : 'none',
        letterSpacing: resumeStyle.headingUppercase ? '0.8px' : undefined,
        borderBottom: `0.75pt solid #${resumeStyle.ruleColor}`,
        paddingBottom: '1.5pt',
        marginTop: lineIdx === 0 ? undefined : '10pt',
        marginBottom: '4pt',
      } : {};

      const isLast = lineIdx === lines.length - 1;
      const content = line + (isLast ? '' : '\n');

      if (hunk.type === 'same') {
        return <span key={lineIdx} style={headingStyle}>{content}</span>;
      }

      if (hunk.type === 'added') {
        return (
          <span
            key={lineIdx}
            style={headingStyle}
            className={isReverted
              ? 'bg-gray-700/40 text-gray-500 line-through rounded px-0.5'
              : 'bg-green-400/20 text-green-300 rounded px-0.5'}
          >
            {content}
          </span>
        );
      }

      // removed
      return (
        <span
          key={lineIdx}
          style={headingStyle}
          className={isReverted
            ? 'bg-green-400/20 text-green-300 rounded px-0.5'
            : 'bg-red-400/15 text-red-400 line-through rounded px-0.5'}
        >
          {content}
        </span>
      );
    });

    if (hunk.type === 'same') {
      return <span key={hunk.id}>{renderedLines}</span>;
    }

    if (hunk.type === 'added') {
      return (
        <span key={hunk.id} className="group relative inline">
          {renderedLines}
          <button
            onClick={() => toggleRevert(hunk.id, 'added')}
            title={isReverted ? 'Restore this addition' : 'Remove this addition'}
            className={`invisible group-hover:visible inline-flex items-center gap-0.5 ml-0.5 text-[10px] px-1 py-0.5 rounded transition-colors align-middle ${
              isReverted
                ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                : 'bg-gray-700 text-gray-400 hover:bg-red-500/30 hover:text-red-300'
            }`}
          >
            {isReverted ? <><Check size={9} /> keep</> : <><X size={9} /> remove</>}
          </button>
        </span>
      );
    }

    // removed
    return (
      <span key={hunk.id} className="group relative inline">
        {renderedLines}
        <button
          onClick={() => toggleRevert(hunk.id, 'removed')}
          title={isReverted ? 'Remove this text again' : 'Restore this original text'}
          className={`invisible group-hover:visible inline-flex items-center gap-0.5 ml-0.5 text-[10px] px-1 py-0.5 rounded transition-colors align-middle ${
            isReverted
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-gray-700 text-gray-400 hover:bg-green-500/30 hover:text-green-300'
          }`}
        >
          {isReverted ? <><X size={9} /> remove</> : <><Undo2 size={9} /> restore</>}
        </button>
      </span>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col min-h-[540px]">

      {/* ── Tab bar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 gap-2">
        <div className="flex gap-1">
          {original && (
            <button
              onClick={() => setTab('original')}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors
                ${tab === 'original' ? 'bg-gray-800 text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Original
            </button>
          )}
          <button
            onClick={() => setTab('tailored')}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors
              ${tab === 'tailored' ? 'bg-gray-800 text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <span className="flex items-center gap-1.5">
              Output
              {editMode && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />}
            </span>
          </button>
          <button
            onClick={() => setTab('diff')}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors
              ${tab === 'diff' ? 'bg-gray-800 text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <span className="flex items-center gap-1.5">
              What Changed
              {changedCount > 0 && (
                <span className="bg-green-400/20 text-green-400 text-[10px] px-1.5 py-0.5 rounded-full font-mono leading-none">
                  {changedCount}
                </span>
              )}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1 ml-auto">
          {/* Plain-text toggle (Tailored tab, view mode only) */}
          {tailored && !editMode && tab === 'tailored' && (
            <button
              onClick={() => setShowPlainText(p => !p)}
              aria-pressed={showPlainText}
              aria-label={showPlainText ? 'Switch to styled view' : 'Switch to plain text view'}
              title={showPlainText ? 'Show styled preview' : 'Show plain text'}
              className={`flex items-center gap-1.5 text-xs transition-colors px-2 py-1.5 rounded-md hover:bg-gray-800 ${
                showPlainText ? 'text-amber-400' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <AlignLeft size={12} />
              {showPlainText ? 'Styled' : 'Plain'}
            </button>
          )}

          {/* Edit / Save / Discard */}
          {tailored && !editMode && (
            <button
              onClick={enterEditMode}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-amber-400 transition-colors px-2 py-1.5 rounded-md hover:bg-gray-800"
              title="Edit resume manually"
            >
              <Pencil size={12} />
              Edit
            </button>
          )}
          {editMode && (
            <>
              <button
                onClick={saveEdit}
                className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 transition-colors px-2 py-1.5 rounded-md hover:bg-gray-800"
              >
                {editSaved ? <Check size={12} /> : <Save size={12} />}
                {editSaved ? 'Saved!' : 'Save'}
              </button>
              <button
                onClick={discardEdit}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors px-2 py-1.5 rounded-md hover:bg-gray-800"
              >
                <X size={12} />
                Discard
              </button>
            </>
          )}

          {/* Reset reverts */}
          {revertedCount > 0 && !editMode && (
            <button
              onClick={resetReverts}
              className="flex items-center gap-1.5 text-xs text-amber-400/80 hover:text-amber-400 transition-colors px-2 py-1.5 rounded-md hover:bg-gray-800"
              title="Undo all reverts"
            >
              <RotateCcw size={11} />
              Reset ({revertedCount})
            </button>
          )}

          {/* Copy */}
          {displayText && (
            <button
              onClick={copy}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-200 transition-colors px-2 py-1.5 rounded-md hover:bg-gray-800"
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}

          {/* Download dropdown */}
          {displayText && (
            <div className="relative" ref={dlRef}>
              <button
                onClick={() => setDlOpen(o => !o)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-200 transition-colors px-2 py-1.5 rounded-md hover:bg-gray-800"
              >
                {dlLoading
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Download size={12} />
                }
                Download
                <ChevronDown size={11} className={dlOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>
              {dlOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-30 overflow-hidden">
                  <button
                    onClick={() => handleDownload('pdf')}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-gray-300 hover:bg-gray-700 transition-colors"
                  >
                    <FileType2 size={13} className="text-red-400" />
                    <div className="text-left">
                      <p className="font-medium">PDF</p>
                      <p className="text-gray-500 text-[10px]">ATS-optimised · recommended</p>
                    </div>
                  </button>
                  <button
                    onClick={() => handleDownload('docx')}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-gray-300 hover:bg-gray-700 transition-colors"
                  >
                    <FileText size={13} className="text-blue-400" />
                    <div className="text-left">
                      <p className="font-medium">Word (.docx)</p>
                      <p className="text-gray-500 text-[10px]">Editable · ATS-friendly</p>
                    </div>
                  </button>
                  <div className="border-t border-gray-700" />
                  <button
                    onClick={() => handleDownload('txt')}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-gray-400 hover:bg-gray-700 transition-colors"
                  >
                    <FileText size={13} className="text-gray-500" />
                    <div className="text-left">
                      <p className="font-medium">Plain text (.txt)</p>
                      <p className="text-gray-500 text-[10px]">Raw text</p>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 p-4 overflow-auto">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Loader2 size={24} className="animate-spin text-green-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-300">Tailoring your resume…</p>
              <p className="text-xs mt-1 text-gray-500">Sending ~{tokenEstimate} tokens</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-sm font-medium text-red-400 mb-1">Error</p>
            <p className="text-xs text-red-400/70 font-mono break-all">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && !tailored && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-700">
            <p className="text-4xl font-black text-green-400/15 mb-3">FYR</p>
            <p className="text-sm">Your tailored resume will appear here</p>
            <p className="text-xs mt-1">Paste a JD + resume, configure your API, then click Tailor</p>
          </div>
        )}

        {/* ── Original tab ── */}
        {!loading && !error && original && tab === 'original' && (
          <div className="space-y-2">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider">
              Original — {resumeStyle.fontFamily.split(',')[0]} · {resumeStyle.bodyFontSize}pt
            </p>
            {originalHtml ? (
              <div
                className="resume-preview-container bg-white rounded-xl p-5 overflow-auto border border-gray-700"
                style={{ maxHeight: '640px' }}
                dangerouslySetInnerHTML={{ __html: originalHtml }}
              />
            ) : (
              <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                {original}
              </pre>
            )}
          </div>
        )}

        {/* ── Output (Tailored) tab ── */}
        {!loading && !error && tailored && tab === 'tailored' && (
          <div className="h-full space-y-3">

            {/* Edit mode banner */}
            {editMode && (
              <div className="flex items-center gap-2 text-xs text-amber-400/80 bg-amber-400/5 border border-amber-400/20 rounded-lg px-3 py-2">
                <Pencil size={11} />
                <span>Edit mode — type in the editor. The preview updates live. Click <strong>Save</strong> to keep or <strong>Discard</strong> to cancel.</span>
              </div>
            )}

            {/* Edit mode: split pane */}
            {editMode && (
              <div className="flex flex-col md:flex-row gap-3">
                {/* Left — textarea */}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Plain text editor</p>
                  <textarea
                    ref={textareaRef}
                    value={editDraft}
                    onChange={e => setEditDraft(e.target.value)}
                    rows={32}
                    spellCheck={false}
                    className="w-full bg-gray-800/60 border border-amber-400/30 rounded-xl px-4 py-3 text-sm text-gray-200 font-mono leading-relaxed focus:outline-none focus:border-amber-400/60 resize-none"
                  />
                </div>
                {/* Right — live styled preview */}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Live preview</p>
                  <div
                    aria-label="Live styled preview"
                    role="region"
                    className="resume-preview-container bg-white rounded-xl overflow-auto border border-gray-700"
                    style={{ maxHeight: '640px', minHeight: '200px' }}
                    dangerouslySetInnerHTML={{ __html: livePreviewHtml || viewHtml }}
                  />
                </div>
              </div>
            )}

            {/* View mode: styled HTML (default) or plain text (toggle) */}
            {!editMode && (
              showPlainText ? (
                <pre
                  className="text-sm text-gray-200 whitespace-pre-wrap font-mono leading-relaxed cursor-text select-text"
                  onDoubleClick={enterEditMode}
                  title="Double-click to edit"
                >
                  {baseText}
                </pre>
              ) : (
                <div
                  className="resume-preview-container bg-white rounded-xl overflow-auto border border-gray-700"
                  style={{ maxHeight: '640px' }}
                  onDoubleClick={enterEditMode}
                  title="Double-click to edit"
                  dangerouslySetInnerHTML={{ __html: viewHtml }}
                />
              )
            )}

            {!editMode && (
              <p className="text-xs text-gray-700 text-center">
                Double-click to edit · use <Pencil size={10} className="inline" /> Edit above · toggle <AlignLeft size={10} className="inline" /> for plain text
              </p>
            )}
          </div>
        )}

        {/* ── What Changed tab ── */}
        {!loading && !error && tailored && tab === 'diff' && (
          <div className="space-y-3">

            {/* Edit mode */}
            {editMode && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-amber-400/80 bg-amber-400/5 border border-amber-400/20 rounded-lg px-3 py-2">
                  <Pencil size={11} />
                  <span>Editing — diff updates live below as you type. <strong>Save</strong> to keep or <strong>Discard</strong> to cancel.</span>
                </div>
                <textarea
                  ref={textareaRef}
                  value={editDraft}
                  onChange={e => setEditDraft(e.target.value)}
                  rows={14}
                  spellCheck={false}
                  className="w-full bg-gray-800/60 border border-amber-400/30 rounded-xl px-4 py-3 text-sm text-gray-200 font-mono leading-relaxed focus:outline-none focus:border-amber-400/60 resize-none"
                />
                <div className="border-t border-gray-800 pt-3">
                  <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Live diff vs original</p>
                  <div
                    className="diff-styled-container whitespace-pre-wrap"
                    style={{
                      fontFamily: `'${resumeStyle.fontFamily}', sans-serif`,
                      fontSize: `${resumeStyle.bodyFontSize}pt`,
                      lineHeight: resumeStyle.lineHeight,
                      color: `#${resumeStyle.bodyColor}`,
                    }}
                  >
                    {editModeHunks.length === 0
                      ? <span className="text-gray-600 text-xs">No changes yet…</span>
                      : editModeHunks.map((hunk, i) => {
                          if (hunk.type === 'same')    return <span key={i}>{hunk.text}</span>;
                          if (hunk.type === 'added')   return <span key={i} className="bg-green-400/20 text-green-300 rounded px-0.5">{hunk.text}</span>;
                          return <span key={i} className="bg-red-400/15 text-red-400 line-through rounded px-0.5">{hunk.text}</span>;
                        })
                    }
                  </div>
                </div>
              </div>
            )}

            {/* Legend — normal mode */}
            {!editMode && (
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 pb-3 border-b border-gray-800">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-green-400/30 inline-block" />
                  Added by AI
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-400/20 inline-block" />
                  Removed from original
                </span>
                <span className="ml-auto text-gray-600 flex items-center gap-1">
                  <Undo2 size={10} /> hover to revert · <Pencil size={10} /> Edit button to free-edit
                </span>
              </div>
            )}

            {/* Normal mode: styled diff with resume font/colors + per-hunk reverts */}
            {!editMode && (
              <div
                className="diff-styled-container whitespace-pre-wrap"
                style={{
                  fontFamily: `'${resumeStyle.fontFamily}', sans-serif`,
                  fontSize: `${resumeStyle.bodyFontSize}pt`,
                  lineHeight: resumeStyle.lineHeight,
                  color: `#${resumeStyle.bodyColor}`,
                }}
              >
                {initialHunks.map(hunk => renderStyledHunk(hunk))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
