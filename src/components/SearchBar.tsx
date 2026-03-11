import React, { useState } from 'react';

type SizeFilter = 'all' | 'large' | 'medium' | 'small';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  sizeFilter: SizeFilter;
  onSizeFilterChange: (filter: SizeFilter) => void;
  placeholder?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  sizeFilter,
  onSizeFilterChange,
  placeholder = 'Search files and folders...',
}) => {
  const [showFilters, setShowFilters] = useState(false);

  const sizeOptions: { value: SizeFilter; label: string; description: string }[] = [
    { value: 'all', label: 'All Sizes', description: 'Show all files' },
    { value: 'large', label: 'Large', description: '≥ 100 MB' },
    { value: 'medium', label: 'Medium', description: '10 - 100 MB' },
    { value: 'small', label: 'Small', description: '< 10 MB' },
  ];

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        {/* Search input */}
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
            search
          </span>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="app-surface w-full pl-10 pr-10 py-2.5 rounded-xl app-text-primary placeholder-slate-500 border focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/40 transition-all"
          />
          {value && (
            <button
              onClick={() => onChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-secondary transition-colors"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          )}
        </div>

        {/* Filter button */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`p-2.5 rounded-xl border transition-all ${
            showFilters || sizeFilter !== 'all'
              ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
              : 'app-surface text-slate-400 hover:text-secondary'
          }`}
          title="Size filters"
        >
          <span className="material-symbols-outlined text-lg">filter_list</span>
        </button>
      </div>

      {/* Filter dropdown */}
      {showFilters && (
        <div className="app-surface absolute top-full left-0 right-0 mt-2 border rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="p-3 border-b border-slate-200 dark:border-slate-700/50">
            <h4 className="text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wide">Size Filter</h4>
          </div>
          <div className="p-2">
            {sizeOptions.map(option => (
              <button
                key={option.value}
                onClick={() => {
                  onSizeFilterChange(option.value);
                  setShowFilters(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                  sizeFilter === option.value
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'app-text-primary hover:bg-slate-100 dark:hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base">
                    {sizeFilter === option.value ? 'radio_button_checked' : 'radio_button_unchecked'}
                  </span>
                  <span className="text-sm">{option.label}</span>
                </div>
                <span className="text-xs text-slate-500">{option.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchBar;
