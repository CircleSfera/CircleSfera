import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The site key is read once, when the module loads: each case sets the
// environment first and loads the widget afresh.
const load = async () => (await import('./TurnstileWidget')).default;
const onToken = vi.fn();
type Options = {
  sitekey: string;
  theme?: string;
  callback: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
};
const provider = () => {
  const made: { el: HTMLElement; options: Options }[] = [];
  const api = {
    render: vi.fn((el: HTMLElement, options: Options) => {
      made.push({ el, options });
      return 'widget-1';
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  return { api, made };
};
const script = () =>
  document.getElementById('cf-turnstile-script') as HTMLScriptElement | null;

describe('TurnstileWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    window.turnstile = undefined;
    script()?.remove();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    window.turnstile = undefined;
    script()?.remove();
  });

  it('shows nothing and gives no token where no site key is set', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
    const Widget = await load();

    const { container } = render(<Widget onToken={onToken} />);

    expect(container).toBeEmptyDOMElement();
    expect(onToken).toHaveBeenCalledWith(null);
    expect(script()).toBeNull();
  });

  it('says the check is unavailable in production without a site key', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
    vi.stubEnv('PROD', true);
    const Widget = await load();

    render(<Widget onToken={onToken} />);

    expect(screen.getByText(/Security check unavailable/)).toBeInTheDocument();
  });

  it('draws the check with the site key once the provider is there, and passes the token on', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-1');
    const { api, made } = provider();
    window.turnstile = api;
    const Widget = await load();

    const { container } = render(<Widget onToken={onToken} />);

    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    expect(made[0].options).toMatchObject({
      sitekey: 'site-key-1',
      theme: 'dark',
    });
    await waitFor(() =>
      expect(container.firstElementChild).toHaveAttribute('data-ready', 'true'),
    );
    // Already loaded: no second copy of the provider's script.
    expect(script()).toBeNull();

    act(() => made[0].options.callback('token-1'));
    expect(onToken).toHaveBeenLastCalledWith('token-1');
  });

  it('withdraws the token when the check fails or runs out', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-1');
    const { api, made } = provider();
    window.turnstile = api;
    const Widget = await load();
    render(<Widget onToken={onToken} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());

    act(() => made[0].options.callback('token-1'));
    act(() => made[0].options['expired-callback']?.());
    expect(onToken).toHaveBeenLastCalledWith(null);

    act(() => made[0].options.callback('token-2'));
    act(() => made[0].options['error-callback']?.());
    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it('starts the check again when asked, withdrawing the token', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-1');
    const { api } = provider();
    window.turnstile = api;
    const Widget = await load();
    render(<Widget onToken={onToken} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    onToken.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Reset captcha' }));

    expect(api.reset).toHaveBeenCalledWith('widget-1');
    expect(onToken).toHaveBeenCalledWith(null);
  });

  it('removes the check when the form goes away, even if the provider complains', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-1');
    const { api } = provider();
    api.remove.mockImplementation(() => {
      throw new Error('already gone');
    });
    window.turnstile = api;
    const Widget = await load();
    const { unmount } = render(<Widget onToken={onToken} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());

    expect(() => unmount()).not.toThrow();
    expect(api.remove).toHaveBeenCalledWith('widget-1');
  });

  it('loads the script of the provider when it is not there, and draws once it arrives', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-1');
    const Widget = await load();
    render(<Widget onToken={onToken} />);

    const added = script() as HTMLScriptElement;
    expect(added.src).toBe(
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    );
    expect(added.async).toBe(true);

    const { api } = provider();
    window.turnstile = api;
    act(() => added.onload?.(new Event('load')));

    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
  });

  it('gives no token when the script of the provider cannot be loaded', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-1');
    const Widget = await load();
    render(<Widget onToken={onToken} />);
    onToken.mockClear();

    act(() => void script()?.onerror?.(new Event('error')));

    await waitFor(() => expect(onToken).toHaveBeenCalledWith(null));
  });

  it('waits for a script another form already asked for, instead of adding a second', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-1');
    const Widget = await load();
    render(<Widget onToken={onToken} />);
    render(<Widget onToken={onToken} />);

    expect(document.querySelectorAll('#cf-turnstile-script')).toHaveLength(1);

    const { api } = provider();
    window.turnstile = api;
    act(() => {
      script()?.onload?.(new Event('load'));
      script()?.dispatchEvent(new Event('load'));
    });

    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(2));
  });

  it('draws nothing if the form went away before the script arrived', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-1');
    const Widget = await load();
    const { unmount } = render(<Widget onToken={onToken} />);
    const added = script() as HTMLScriptElement;

    unmount();
    const { api } = provider();
    window.turnstile = api;
    await act(async () => {
      added.onload?.(new Event('load'));
    });

    expect(api.render).not.toHaveBeenCalled();
  });
});
