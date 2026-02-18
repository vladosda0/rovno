interface SuggestionChipsProps {
  suggestions: string[];
  onSelect: (text: string) => void;
}

export function SuggestionChips({ suggestions, onSelect }: SuggestionChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5 w-full min-w-0">
      {suggestions.map((s) => (
        <button
          key={s}
          onClick={() => onSelect(s)}
          className="rounded-pill px-3 py-1 text-caption font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors border border-accent/20"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
