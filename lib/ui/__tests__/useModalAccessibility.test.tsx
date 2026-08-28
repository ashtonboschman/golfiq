/** @jest-environment jsdom */

import React, { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useModalAccessibility } from '@/lib/ui/useModalAccessibility';

function ModalHarness() {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);

  useModalAccessibility({
    isOpen,
    dialogRef,
    initialFocusRef,
    onDismiss: () => setIsOpen(false),
  });

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>Open Dialog</button>
      {isOpen ? (
        <div ref={dialogRef} role="dialog" aria-label="Test dialog" tabIndex={-1}>
          <button ref={initialFocusRef} type="button" onClick={() => setIsOpen(false)}>Cancel</button>
          <button type="button">Continue</button>
        </div>
      ) : null}
    </>
  );
}

describe('useModalAccessibility', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('moves and traps focus, closes on Escape, and restores prior focus', () => {
    render(<ModalHarness />);

    const trigger = screen.getByRole('button', { name: 'Open Dialog' });
    trigger.focus();
    fireEvent.click(trigger);

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(cancel).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');

    continueButton.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(cancel).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(continueButton).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });
});
