import React, { useState, useEffect } from 'react';
import { formatNumberThreeDigits, parseThreeDigitNumber } from '../../lib/accountingEngine';

interface FormattedNumberInputProps {
  value: number | string;
  onValueChange: (numericValue: number, rawFormatted: string) => void;
  allowDecimal?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  id?: string;
  name?: string;
  required?: boolean;
  dir?: 'ltr' | 'rtl';
  ariaLabel?: string;
}

/**
 * Controlled input that automatically formats numbers 3-by-3 (e.g., 1,250,000)
 * live while typing, supporting both Persian (۰-۹) and English (0-9) digits.
 */
export default function FormattedNumberInput({
  value,
  onValueChange,
  allowDecimal = false,
  placeholder = '0',
  className = '',
  disabled = false,
  min,
  max,
  id,
  name,
  required = false,
  dir = 'ltr',
  ariaLabel,
}: FormattedNumberInputProps) {
  const formatDisplay = (val: number | string): string => {
    if (val === '' || val === null || val === undefined) return '';
    const num = typeof val === 'number' ? val : parseThreeDigitNumber(val);
    if (num === 0 && String(val) === '') return '';
    if (num === 0 && String(val) === '0') return '0';
    return formatNumberThreeDigits(val, allowDecimal);
  };

  const [displayValue, setDisplayValue] = useState<string>(() => formatDisplay(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(formatDisplay(value));
    } else {
      const currentParsed = parseThreeDigitNumber(displayValue);
      const externalParsed = typeof value === 'number' ? value : parseThreeDigitNumber(value);
      if (currentParsed !== externalParsed) {
        setDisplayValue(formatDisplay(value));
      }
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (!raw.trim()) {
      setDisplayValue('');
      onValueChange(0, '');
      return;
    }

    const formatted = formatNumberThreeDigits(raw, allowDecimal);
    let numeric = parseThreeDigitNumber(formatted);

    if (min !== undefined && numeric < min) numeric = min;
    if (max !== undefined && numeric > max) numeric = max;

    const finalFormatted =
      max !== undefined && parseThreeDigitNumber(formatted) > max
        ? formatNumberThreeDigits(max, allowDecimal)
        : formatted;

    setDisplayValue(finalFormatted);
    onValueChange(numeric, finalFormatted);
  };

  return (
    <input
      id={id}
      name={name}
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      dir={dir}
      disabled={disabled}
      required={required}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={displayValue}
      onFocus={(e) => {
        setIsFocused(true);
        e.target.select();
      }}
      onBlur={() => {
        setIsFocused(false);
        setDisplayValue(formatDisplay(value));
      }}
      onChange={handleChange}
      className={className}
    />
  );
}
