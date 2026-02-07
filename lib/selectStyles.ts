// Shared react-select styles to match theme and standard form inputs
export const selectStyles = {
  control: (base: any, state: any) => ({
    ...base,
    backgroundColor: 'var(--color-secondary-surface)',
    borderColor: state.isFocused ? 'var(--color-accent)' : 'var(--color-border)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--border-radius)',
    color: 'var(--color-secondary-text)',
    fontSize: '1rem',
    fontFamily: 'var(--font-inter), sans-serif',
    padding: '2px',
    minHeight: '40px',
    cursor: 'pointer',
    boxShadow: state.isFocused ? '0 0 0 1px var(--color-accent)' : 'none',
    '&:hover': {
      borderColor: 'var(--color-accent)',
    },
  }),
  menu: (base: any) => ({
    ...base,
    backgroundColor: 'var(--color-secondary-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--border-radius)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
    zIndex: 1000,
  }),
  menuList: (base: any) => ({
    ...base,
    backgroundColor: 'var(--color-secondary-surface)',
    borderRadius: 'var(--border-radius)',
    padding: '4px',
    // Custom scrollbar styling
    '&::-webkit-scrollbar': {
      width: '8px',
    },
    '&::-webkit-scrollbar-track': {
      background: 'var(--color-primary-surface)',
      borderRadius: '4px',
    },
    '&::-webkit-scrollbar-thumb': {
      background: 'var(--color-border)',
      borderRadius: '4px',
    },
    '&::-webkit-scrollbar-thumb:hover': {
      background: 'var(--color-secondary-text)',
    },
  }),
  option: (base: any, state: any) => ({
    ...base,
    backgroundColor: state.isFocused
      ? 'var(--color-primary-surface)'
      : 'var(--color-secondary-surface)',
    color: 'var(--color-secondary-text)',
    cursor: 'pointer',
    fontSize: '1rem',
    fontFamily: 'var(--font-inter), sans-serif',
    padding: 'var(--padding)',
    borderRadius: '4px',
    '&:active': {
      backgroundColor: 'var(--color-primary-surface)',
    },
  }),
  valueContainer: (base: any) => ({
    ...base,
    padding: '0 8px',
  }),
  singleValue: (base: any) => ({
    ...base,
    color: 'var(--color-secondary-text)',
    fontSize: '1rem',
    fontFamily: 'var(--font-inter), sans-serif',
  }),
  input: (base: any) => ({
    ...base,
    color: 'var(--color-secondary-text)',
    fontSize: '1rem',
    fontFamily: 'var(--font-inter), sans-serif',
  }),
  placeholder: (base: any) => ({
    ...base,
    color: 'var(--color-secondary-text)',
    opacity: 0.6,
    fontSize: '1rem',
    fontFamily: 'var(--font-inter), sans-serif',
  }),
  dropdownIndicator: (base: any) => ({
    ...base,
    color: 'var(--color-secondary-text)',
    cursor: 'pointer',
    '&:hover': {
      color: 'var(--color-secondary-text)',
    },
  }),
  indicatorSeparator: (base: any) => ({
    ...base,
    backgroundColor: 'var(--color-border)',
  }),
  clearIndicator: (base: any) => ({
    ...base,
    color: 'var(--color-secondary-text)',
    cursor: 'pointer',
    '&:hover': {
      color: 'var(--color-secondary-text)',
    },
  }),
  menuPortal: (base: any) => ({
    ...base,
    zIndex: 9999,
  }),
};
