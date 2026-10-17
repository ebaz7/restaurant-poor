import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Account } from '../../lib/db';
import { filterAccountsForAutocomplete } from '../../lib/accountingEngine';
import { ChevronDown, Search, Check } from 'lucide-react';

interface AccountAutocompleteSelectProps {
  accounts: Account[];
  selectedCode: string;
  onSelect: (account: Account) => void;
  placeholder?: string;
  className?: string;
}

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  asset: { label: 'دارایی', cls: 'bg-blue-50 text-blue-700' },
  liability: { label: 'بدهی', cls: 'bg-amber-50 text-amber-700' },
  equity: { label: 'سرمایه', cls: 'bg-purple-50 text-purple-700' },
  revenue: { label: 'درآمد', cls: 'bg-emerald-50 text-emerald-700' },
  cogs: { label: 'بهای تمام شده', cls: 'bg-orange-50 text-orange-700' },
  expense: { label: 'هزینه', cls: 'bg-rose-50 text-rose-700' },
};

/**
 * Dual-mode Account selector:
 * 1. Type directly inside the input to search by code (e.g. "102") or Persian name (e.g. "بانک", "حقوق")
 * 2. Or click the dropdown toggle to pick from the full list of accounts.
 */
export default function AccountAutocompleteSelect({
  accounts,
  selectedCode,
  onSelect,
  placeholder = 'تایپ نام/کد سرفصل یا انتخاب از منو...',
  className = '',
}: AccountAutocompleteSelectProps) {
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.code === selectedCode),
    [accounts, selectedCode]
  );

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredAccounts = useMemo(() => {
    return filterAccountsForAutocomplete(accounts, query);
  }, [accounts, query]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChoose = (acc: Account) => {
    onSelect(acc);
    setIsOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) =>
        filteredAccounts.length > 0 ? (prev + 1) % filteredAccounts.length : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) =>
        filteredAccounts.length > 0
          ? (prev - 1 + filteredAccounts.length) % filteredAccounts.length
          : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredAccounts[highlightIndex]) {
        handleChoose(filteredAccounts[highlightIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
    }
  };

  const displayText = isOpen
    ? query
    : selectedAccount
      ? `${selectedAccount.code} - ${selectedAccount.name}`
      : '';

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className={`flex items-center bg-white border rounded-lg transition-all ${
          isOpen
            ? 'border-blue-500 ring-2 ring-blue-500/20'
            : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <Search size={14} className="mr-2.5 text-slate-400 shrink-0 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={displayText}
          placeholder={
            selectedAccount
              ? `${selectedAccount.code} - ${selectedAccount.name}`
              : placeholder
          }
          onFocus={() => {
            setIsOpen(true);
            setQuery('');
            setHighlightIndex(0);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setHighlightIndex(0);
          }}
          onKeyDown={handleKeyDown}
          className="w-full px-2 py-1.5 text-xs font-bold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            if (isOpen) {
              setIsOpen(false);
              setQuery('');
            } else {
              setIsOpen(true);
              setQuery('');
              inputRef.current?.focus();
            }
          }}
          className="px-2 py-1.5 text-slate-400 hover:text-slate-700 border-r border-slate-100 shrink-0"
          title="نمایش لیست سرفصل‌ها"
        >
          <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-50 top-full mt-1 right-0 left-0 min-w-[260px] max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl divide-y divide-slate-50">
          {filteredAccounts.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-400">
              سرفصلی با عبارت «{query}» یافت نشد.
            </div>
          ) : (
            filteredAccounts.map((acc, idx) => {
              const isSelected = acc.code === selectedCode;
              const isHighlighted = idx === highlightIndex;
              const badge = TYPE_BADGE[acc.type] || { label: acc.type, cls: 'bg-slate-100 text-slate-600' };
              return (
                <button
                  key={acc.code}
                  type="button"
                  onMouseEnter={() => setHighlightIndex(idx)}
                  onClick={() => handleChoose(acc)}
                  className={`w-full px-3 py-2 text-right flex items-center justify-between gap-2 transition-colors ${
                    isHighlighted
                      ? 'bg-blue-50/90 text-blue-950'
                      : isSelected
                        ? 'bg-slate-50 font-extrabold'
                        : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px] font-black shrink-0">
                      {acc.code}
                    </span>
                    <span className="text-xs font-bold text-slate-800 truncate">{acc.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${badge.cls}`}>
                      {badge.label}
                    </span>
                    {isSelected && <Check size={13} className="text-blue-600" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
