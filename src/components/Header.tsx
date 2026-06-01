export default function Header() {
  return (
    <header className="border-b border-gray-800 bg-gray-950">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-black text-green-400 tracking-tight">FYR</span>
          <span className="text-xs font-semibold text-green-400/60 uppercase tracking-widest ml-1">Beta</span>
        </div>
        <div className="w-px h-8 bg-gray-700" />
        <div>
          <p className="text-sm font-medium text-gray-200">Fix Your Resume</p>
          <p className="text-xs text-gray-500">AI-powered resume tailoring for any job description</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-500 bg-gray-900 border border-gray-800 px-2.5 py-1 rounded-full">
            Keys stored locally only
          </span>
        </div>
      </div>
    </header>
  );
}
