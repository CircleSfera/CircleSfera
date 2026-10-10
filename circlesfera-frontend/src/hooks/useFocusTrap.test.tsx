import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useFocusTrap } from './useFocusTrap';

/** A dialog the way the app writes them: the handler is made on each render. */
function Panel({
  onClose,
  children,
}: {
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const [text, setText] = useState('');
  const ref = useFocusTrap<HTMLDivElement>(true, undefined, {
    onEscape: () => onClose(),
  });
  return (
    <div ref={ref} tabIndex={-1} data-testid="panel">
      <button type="button">First</button>
      <input
        aria-label="Name"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {children}
      <button type="button">Last</button>
    </div>
  );
}

function Host({ empty = false }: { empty?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open &&
        (empty ? <EmptyPanel /> : <Panel onClose={() => setOpen(false)} />)}
    </>
  );
}

function EmptyPanel() {
  const ref = useFocusTrap<HTMLDivElement>(true);
  return <div ref={ref} tabIndex={-1} data-testid="panel" />;
}

function Toggled({ active }: { active: boolean }) {
  const ref = useFocusTrap<HTMLDivElement>(active);
  return (
    <div ref={ref}>
      <button type="button">Inside</button>
    </div>
  );
}

const open = () => {
  const opener = screen.getByRole('button', { name: 'Open' });
  opener.focus();
  fireEvent.click(opener);
  return opener;
};

describe('useFocusTrap', () => {
  it('moves the focus to the first control when it opens', () => {
    render(<Host />);
    open();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('focuses the container when it has no control', () => {
    render(<Host empty />);
    open();
    expect(screen.getByTestId('panel')).toHaveFocus();
  });

  it('leaves the focus where the person is typing when the dialog draws again', () => {
    render(<Host />);
    open();
    const field = screen.getByRole('textbox', { name: 'Name' });
    field.focus();

    fireEvent.change(field, { target: { value: 'a' } });
    fireEvent.change(field, { target: { value: 'ab' } });

    expect(field).toHaveFocus();
  });

  it('goes round from the last control to the first with Tab, and back with Shift', () => {
    render(<Host />);
    open();
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('lets Tab move normally between the controls in the middle', () => {
    render(<Host />);
    open();
    const field = screen.getByRole('textbox', { name: 'Name' });
    field.focus();

    const forward = fireEvent.keyDown(field, { key: 'Tab' });
    const back = fireEvent.keyDown(field, { key: 'Tab', shiftKey: true });

    // Not prevented: the browser moves the focus itself.
    expect(forward).toBe(true);
    expect(back).toBe(true);
    expect(field).toHaveFocus();
  });

  it('holds Tab when there is nothing to move to', () => {
    render(<Host empty />);
    open();

    const allowed = fireEvent.keyDown(screen.getByTestId('panel'), {
      key: 'Tab',
    });

    expect(allowed).toBe(false);
  });

  it('ignores other keys', () => {
    render(<Host />);
    open();
    const first = screen.getByRole('button', { name: 'First' });
    expect(fireEvent.keyDown(first, { key: 'a' })).toBe(true);
    expect(first).toHaveFocus();
  });

  it('closes with Escape, using the handler of the latest render, without letting the key through', () => {
    const outer = vi.fn();
    render(
      // biome-ignore lint/a11y/noStaticElementInteractions: listens for a key that must not arrive
      <div onKeyDown={outer}>
        <Host />
      </div>,
    );
    open();
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'a' },
    });

    fireEvent.keyDown(screen.getByRole('button', { name: 'First' }), {
      key: 'Escape',
    });

    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
    expect(outer).not.toHaveBeenCalled();
  });

  it('gives the focus back to what opened it when the dialog goes away', () => {
    render(<Host />);
    const opener = open();
    const field = screen.getByRole('textbox', { name: 'Name' });
    field.focus();
    fireEvent.change(field, { target: { value: 'a' } });

    fireEvent.keyDown(field, { key: 'Escape' });

    expect(opener).toHaveFocus();
  });

  it('gives the focus back when it is switched off without going away', () => {
    const { rerender } = render(
      <>
        <button type="button">Outside</button>
        <Toggled active={false} />
      </>,
    );
    const outside = screen.getByRole('button', { name: 'Outside' });
    outside.focus();

    rerender(
      <>
        <button type="button">Outside</button>
        <Toggled active />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Inside' })).toHaveFocus();

    rerender(
      <>
        <button type="button">Outside</button>
        <Toggled active={false} />
      </>,
    );
    expect(outside).toHaveFocus();
  });

  it('works on a container given from outside', () => {
    function Given() {
      const [node] = useState(() => ({
        current: null as HTMLDivElement | null,
      }));
      useFocusTrap(true, node);
      return (
        <div ref={node}>
          <button type="button">Given</button>
        </div>
      );
    }
    render(<Given />);
    expect(screen.getByRole('button', { name: 'Given' })).toHaveFocus();
  });
});
