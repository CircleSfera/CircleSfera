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
    <div className="flex bg-black/40 p-1 rounded-lg border border-white/10 w-full sm:w-auto overflow-x-auto no-scrollbar">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap ${
            value === opt.value
              ? 'bg-white/10 text-white shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
