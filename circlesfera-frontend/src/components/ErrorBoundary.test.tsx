import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

function Broken(): never {
  throw new Error('audioList.map is not a function');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React reports the caught error on the console.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('shows the page when nothing fails', () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('does not show the technical error text to people using the app', () => {
    vi.stubEnv('DEV', false);
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );

    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
    expect(
      screen.queryByText('audioList.map is not a function'),
    ).not.toBeInTheDocument();
  });

  it('shows the error text while developing', () => {
    vi.stubEnv('DEV', true);
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );

    expect(
      screen.getByText('audioList.map is not a function'),
    ).toBeInTheDocument();
  });

  it('shows the given fallback instead of the default screen', () => {
    render(
      <ErrorBoundary fallback={<p>custom fallback</p>}>
        <Broken />
      </ErrorBoundary>,
    );

    expect(screen.getByText('custom fallback')).toBeInTheDocument();
  });

  it('fills the window for the whole app and only its own area for one screen', () => {
    const { unmount } = render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert').className).toContain('min-h-dvh');
    unmount();

    render(
      <ErrorBoundary scope="page">
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert').className).not.toContain('min-h-dvh');
  });

  it('shows the screen again after trying again, once it no longer fails', () => {
    let broken = true;
    function Flaky() {
      if (broken) throw new Error('down for a moment');
      return <p>back</p>;
    }
    render(
      <ErrorBoundary scope="page">
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    broken = false;
    fireEvent.click(screen.getAllByRole('button')[0]);

    expect(screen.getByText('back')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
