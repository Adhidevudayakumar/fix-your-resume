interface Props {
  keywords: string[];
  matched?: Set<string>;
}

export default function KeywordBadges({ keywords, matched }: Props) {
  if (!keywords.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
        Extracted JD Keywords ({keywords.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {keywords.map(kw => {
          const isMatched = matched?.has(kw.toLowerCase());
          return (
            <span
              key={kw}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors
                ${isMatched
                  ? 'bg-green-400/15 border-green-400/40 text-green-300'
                  : 'bg-gray-800 border-gray-700 text-gray-400'}`}
            >
              {kw}
            </span>
          );
        })}
      </div>
    </div>
  );
}
