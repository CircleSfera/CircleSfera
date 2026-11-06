import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import toast from 'react-hot-toast';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AppToaster,
  ERROR_NOTICE_MS,
  NOTICE_MS,
  SWIPE_CLOSE_PX,
} from './AppToaster';

describe('AppToaster', () => {
  afterEach(() => {
    vi.useRealTimers();
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

  it('shows a notice as a pill at the top centre, in the dark surface of the product', async () => {
    const { container } = render(<AppToaster />);
    act(() => {
      toast.success('Saved');
    });

    const text = await screen.findByText('Saved');
    const pill = container.querySelector('.app-toast') as HTMLElement;
    expect(pill).toContainElement(text);
    expect(pill.style.background).toContain('--surface-raised');
    expect(pill.style.borderRadius).toBe('9999px');
    expect(placeOf(container)).toEqual({ edge: 'top', side: 'center' });
  });

  it('stays at the top centre with a dialog open: it never covers its buttons', async () => {
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
  });

  it('shows one at a time: a new one replaces the last', async () => {
    render(<AppToaster />);
    act(() => {
      for (const text of ['one', 'two', 'three']) toast(text);
    });
    await waitFor(() => expect(screen.queryByText('two')).toBeNull());
    expect(screen.queryByText('one')).toBeNull();
    expect(screen.getByText('three')).toBeInTheDocument();
    expect(document.querySelectorAll('.app-toast')).toHaveLength(1);
  });

  it('keeps a notice three seconds and an error five, the error announced at once', async () => {
    vi.useFakeTimers();
    render(<AppToaster />);
    act(() => {
      toast.success('Saved');
    });
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(NOTICE_MS + 100));
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.queryByText('Saved')).toBeNull();

    act(() => {
      toast.error('Could not save');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
    act(() => vi.advanceTimersByTime(NOTICE_MS + 100));
    expect(screen.getByText('Could not save')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(ERROR_NOTICE_MS));
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.queryByText('Could not save')).toBeNull();
  });

  it('closes with a tap, or a swipe up, but not a small drag', async () => {
    vi.useFakeTimers();
    render(<AppToaster />);
    act(() => {
      toast('Tap me');
    });
    fireEvent.click(screen.getByText('Tap me'));
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.queryByText('Tap me')).toBeNull();

    act(() => {
      toast('Swipe me');
    });
    const body = screen.getByText('Swipe me').parentElement as HTMLElement;
    fireEvent.pointerDown(body, { clientY: 100 });
    fireEvent.pointerUp(body, { clientY: 100 - SWIPE_CLOSE_PX / 2 });
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByText('Swipe me')).toBeInTheDocument();
    fireEvent.pointerDown(body, { clientY: 100 });
    fireEvent.pointerUp(body, { clientY: 100 - SWIPE_CLOSE_PX - 1 });
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.queryByText('Swipe me')).toBeNull();
  });
});
