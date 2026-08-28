import { Check, X } from "lucide-react";

interface BinaryNullToggleProps {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}

export default function BinaryNullToggle({ value, onChange, disabled = false }: BinaryNullToggleProps) {
  const handleClick = (val: number) => {
    if (!disabled) onChange(value === val ? null : val);
  };

  return (
    <div className="binary-null-toggle">
      <button
        type="button"
        className={value === 0 ? 'active-false' : ''}
        onClick={() => handleClick(0)}
        disabled={disabled}
        aria-label="No"
        aria-pressed={value === 0}
      >
        <X aria-hidden="true" />
      </button>
      <button
        type="button"
        className={value === 1 ? 'active-true' : ''}
        onClick={() => handleClick(1)}
        disabled={disabled}
        aria-label="Yes"
        aria-pressed={value === 1}
      >
        <Check aria-hidden="true" />
      </button>
    </div>
  );
}
