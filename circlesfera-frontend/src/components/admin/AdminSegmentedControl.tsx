interface Option {
  value: string;
  label: string;
}

interface Props {
  options: Option[];
  value: string;
  onChange: (val: string) => void;
}

// A choice between a few options, as separate buttons: no box around them,
// so it adds none to the filter bar it is usually placed in.
export function AdminSegmentedControl({ options, value, onChange }: Props) {
  return (
    <div className="flex gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 sm:flex-none px-4 min-h-11 sm:min-h-9 py-2 sm:py-1.5 text-xs font-semibold rounded-full transition-all whitespace-nowrap border inline-flex items-center justify-center ${
            value === opt.value
              ? 'bg-brand-primary/20 text-white border-brand-primary/40'
              : 'bg-white/5 text-white/60 border-white/10 hover:text-white/80 hover:bg-white/10'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
