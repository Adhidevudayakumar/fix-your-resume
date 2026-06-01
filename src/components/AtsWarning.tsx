import { AlertTriangle, CheckCircle } from 'lucide-react';

interface Props {
  atsReady: boolean | null;
  onTailorAnyway?: () => void;
}

export default function AtsWarning({ atsReady, onTailorAnyway }: Props) {
  if (atsReady === null) return null;

  if (atsReady) {
    return (
      <div className="flex items-center gap-2 text-xs text-green-400 bg-green-400/5 border border-green-400/20 rounded-lg px-3 py-2">
        <CheckCircle size={14} className="shrink-0" />
        <span>Experience / Projects sections detected — ATS ready</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-400/5 border border-amber-400/20 rounded-lg px-3 py-2.5">
        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
        <div>
          <p className="font-medium mb-0.5">ATS sections not detected</p>
          <p className="text-amber-400/70">
            FYR couldn't find an "Experience" or "Projects" section. Ensure section headers are on their own line (e.g., <span className="font-mono">Experience</span>).
          </p>
        </div>
      </div>
      {onTailorAnyway && (
        <button
          onClick={onTailorAnyway}
          className="w-full text-xs text-gray-400 hover:text-gray-200 border border-gray-700 hover:border-gray-600 rounded-lg px-3 py-2 transition-colors"
        >
          Tailor full resume anyway (no section extraction)
        </button>
      )}
    </div>
  );
}
