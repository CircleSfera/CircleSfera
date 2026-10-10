import { act, render, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { afterEach, describe, expect, it } from 'vitest';
import { AppToaster } from './AppToaster';

describe('AppToaster', () => {
  afterEach(() => {
    act(() => toast.remove());
  });

  // Where the library puts the notices, from how it lays them out.
  const placeOf = (container: HTMLElement) => {
    const placed = container.querySelector('.app-toaster')
      ?.firstElementChild as HTMLElement;
    return {
      edge: placed.style.bottom === '0px' ? 'bottom' : 'top',
      side: placed.style.justifyContent,
    };
  };
  const wideWindow = (wide: boolean) => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: wide,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as never;
    return () => {
      window.matchMedia = original;
    };
  };

  it('shows a notice at the bottom of a phone, in the dark surface of the product', async () => {
    const restore = wideWindow(false);
    const { container } = render(<AppToaster />);
    act(() => {
      toast.success('Saved');
    });

    const text = await screen.findByText('Saved');
    const box = text.parentElement as HTMLElement;
    expect(box.style.background).toContain('--surface-raised');
    expect(box.style.color).toBe('rgb(255, 255, 255)');
    expect(placeOf(container)).toEqual({ edge: 'bottom', side: 'center' });
    restore();
  });

  it('sits at the bottom left on a wide window, dialog or not', async () => {
    const restore = wideWindow(true);
    const { container } = render(
      <>
        <div role="dialog" aria-modal="true" />
        <AppToaster />
      </>,
    );
    act(() => {
      toast('Wide');
    });
    await screen.findByText('Wide');
    // The library leaves the row at its start: the left.
    expect(placeOf(container)).toEqual({ edge: 'bottom', side: '' });
    restore();
  });

  it('moves to the top of a phone while a dialog is open, so its buttons stay free', async () => {
    const restore = wideWindow(false);
    const { container } = render(
      <>
        <div role="dialog" aria-modal="true" />
        <AppToaster />
      </>,
    );
    act(() => {
      toast.error('Could not save');
    });
    await screen.findByText('Could not save');
    expect(placeOf(container)).toEqual({ edge: 'top', side: 'center' });
    restore();
  });

  it('keeps at most three on screen: the older ones are taken away for the new ones', async () => {
    render(<AppToaster />);
    act(() => {
      for (const text of ['one', 'two', 'three', 'four', 'five']) {
        toast(text);
      }
    });

    await waitFor(() => expect(screen.queryByText('one')).toBeNull());
    expect(screen.queryByText('two')).toBeNull();
    for (const text of ['three', 'four', 'five']) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(document.querySelectorAll('.app-toast')).toHaveLength(3);
  });

  it('follows a dialog that opens and closes while the notice is on screen', async () => {
    const restore = wideWindow(false);
    const { container } = render(<AppToaster />);
    act(() => {
      toast.error('Could not save');
    });
    await screen.findByText('Could not save');
    expect(placeOf(container).edge).toBe('bottom');

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    act(() => {
      document.body.appendChild(dialog);
    });
    await waitFor(() => expect(placeOf(container).edge).toBe('top'));

    act(() => {
      dialog.remove();
    });
    await waitFor(() => expect(placeOf(container).edge).toBe('bottom'));
    restore();
  });
});
