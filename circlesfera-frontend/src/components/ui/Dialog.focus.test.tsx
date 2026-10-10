import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { Dialog } from './Dialog';

/** A form in a dialog, written the way the screens of the app write theirs. */
function Rename() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Rename
      </button>
      <Dialog isOpen={open} onClose={() => setOpen(false)} title="Rename">
        <input
          aria-label="New name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Dialog>
    </>
  );
}

describe('Dialog and the keyboard focus', () => {
  it('keeps the focus in the field while the person types', () => {
    renderWithProviders(<Rename />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const field = screen.getByRole('textbox', { name: 'New name' });
    field.focus();

    fireEvent.change(field, { target: { value: 'T' } });
    fireEvent.change(field, { target: { value: 'Tr' } });

    expect(field).toHaveFocus();
  });

  it('gives the focus back to the button that opened it', () => {
    renderWithProviders(<Rename />);
    const opener = screen.getByRole('button', { name: 'Rename' });
    opener.focus();
    fireEvent.click(opener);
    const field = screen.getByRole('textbox', { name: 'New name' });
    field.focus();
    fireEvent.change(field, { target: { value: 'T' } });

    fireEvent.keyDown(field, { key: 'Escape' });

    expect(opener).toHaveFocus();
  });
});
