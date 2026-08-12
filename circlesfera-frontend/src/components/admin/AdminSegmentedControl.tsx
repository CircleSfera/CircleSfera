interface Option {
  value: string;
  label: string;
}

interface Props {
  options: Option[];
  value: string;
  onChange: (val: string) => void;
}

export function AdminSegmentedControl({ options, value, onChange }: Props) {
  return (
    <div className="flex glass-panel p-0.5 rounded-lg w-full sm:w-auto overflow-x-auto no-scrollbar">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 sm:flex-none px-3 min-h-11 sm:min-h-9 py-2 sm:py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap border inline-flex items-center justify-center ${
            value === opt.value
              ? 'bg-brand-primary/15 text-white border-brand-primary/30'
              : 'text-white/50 border-transparent hover:text-white/80 hover:bg-white/5'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
