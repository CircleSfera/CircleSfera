import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';

type Options = {
  sitekey: string;
  theme?: string;
  callback: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
};

/** The widget reads its site key once, when its file loads. */
async function load(siteKey: string | undefined, prod = false) {
  vi.resetModules();
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', siteKey as string);
  vi.stubEnv('PROD', prod);
  return (await import('./TurnstileWidget')).default;
}

const turnstile = {
  options: null as Options | null,
  render: vi.fn((_el: HTMLElement, options: Options) => {
    turnstile.options = options;
    return 'widget-1';
  }),
  reset: vi.fn(),
  remove: vi.fn(),
};
const script = () =>
  document.getElementById('cf-turnstile-script') as HTMLScriptElement | null;
const settle = () => act(async () => {});

describe('TurnstileWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    turnstile.options = null;
    script()?.remove();
    window.turnstile = undefined;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    window.turnstile = undefined;
  });

  describe('with no site key', () => {
    it('shows nothing while developing and reports that there is no token', async () => {
      const Widget = await load('');
      const onToken = vi.fn();
      const { container } = renderWithProviders(<Widget onToken={onToken} />);

      expect(container).toBeEmptyDOMElement();
      expect(onToken).toHaveBeenCalledWith(null);
      expect(script()).toBeNull();
    });

    it('says the check is unavailable in production, in the language of the person', async () => {
      const Widget = await load('', true);
      const english = renderWithProviders(<Widget onToken={vi.fn()} />);
      expect(
        screen.getByText(
          'The security check is not available. Reload the page in a minute and try again.',
        ),
      ).toBeInTheDocument();
      english.unmount();

      renderWithProviders(<Widget onToken={vi.fn()} />, { lng: 'es' });
      expect(
        screen.getByText(/La comprobación de seguridad no está disponible/),
      ).toBeInTheDocument();
    });
  });

  describe('with a site key', () => {
    it('loads the script once, draws the challenge and hands over the token', async () => {
      const Widget = await load('site-key-1');
      const onToken = vi.fn();
      const { container } = renderWithProviders(<Widget onToken={onToken} />);

      expect(script()?.src).toBe(
        'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
      );
      expect(container.querySelector('[data-ready]')).toHaveAttribute(
        'data-ready',
        'false',
      );

      window.turnstile = turnstile;
      await act(async () => script()?.onload?.(new Event('load')));

      expect(turnstile.render).toHaveBeenCalledTimes(1);
      expect(turnstile.options).toMatchObject({
        sitekey: 'site-key-1',
        theme: 'dark',
      });
      expect(container.querySelector('[data-ready]')).toHaveAttribute(
        'data-ready',
        'true',
      );

      act(() => turnstile.options?.callback('token-abc'));
      expect(onToken).toHaveBeenLastCalledWith('token-abc');
    });

    it('takes the token back when the challenge fails or runs out', async () => {
      window.turnstile = turnstile;
      const Widget = await load('site-key-1');
      const onToken = vi.fn();
      renderWithProviders(<Widget onToken={onToken} />);
      await settle();
      act(() => turnstile.options?.callback('token-abc'));

      act(() => turnstile.options?.['error-callback']?.());
      expect(onToken).toHaveBeenLastCalledWith(null);

      act(() => turnstile.options?.callback('token-def'));
      act(() => turnstile.options?.['expired-callback']?.());
      expect(onToken).toHaveBeenLastCalledWith(null);
    });

    it('draws at once when the script is already on the page, without adding it again', async () => {
      window.turnstile = turnstile;
      const Widget = await load('site-key-1');
      renderWithProviders(<Widget onToken={vi.fn()} />);
      await settle();

      expect(turnstile.render).toHaveBeenCalledTimes(1);
      expect(script()).toBeNull();
    });

    it('waits for a script another form is already loading', async () => {
      const Widget = await load('site-key-1');
      const first = renderWithProviders(<Widget onToken={vi.fn()} />);
      const second = renderWithProviders(<Widget onToken={vi.fn()} />);
      expect(document.querySelectorAll('#cf-turnstile-script')).toHaveLength(1);

      window.turnstile = turnstile;
      await act(async () => {
        script()?.onload?.(new Event('load'));
        script()?.dispatchEvent(new Event('load'));
      });

      expect(turnstile.render).toHaveBeenCalledTimes(2);
      first.unmount();
      second.unmount();
    });

    it('reports no token when the script cannot be loaded, for every form waiting on it, and lets the next one try again', async () => {
      const Widget = await load('site-key-1');
      const first = vi.fn();
      const second = vi.fn();
      renderWithProviders(<Widget onToken={first} />);
      renderWithProviders(<Widget onToken={second} />);
      const failed = script() as HTMLScriptElement;

      await act(async () => {
        failed.dispatchEvent(new Event('error'));
        (failed.onerror as (e: Event) => void)(new Event('error'));
      });

      expect(first).toHaveBeenLastCalledWith(null);
      expect(second).toHaveBeenLastCalledWith(null);
      expect(turnstile.render).not.toHaveBeenCalled();
      expect(script()).toBeNull();

      renderWithProviders(<Widget onToken={vi.fn()} />);
      expect(script()).not.toBeNull();
    });

    it('resets the challenge and the token from its hidden control', async () => {
      window.turnstile = turnstile;
      const Widget = await load('site-key-1');
      const onToken = vi.fn();
      renderWithProviders(<Widget onToken={onToken} />);
      await settle();
      act(() => turnstile.options?.callback('token-abc'));

      fireEvent.click(
        screen.getByRole('button', { name: 'Reset the security check' }),
      );

      expect(turnstile.reset).toHaveBeenCalledWith('widget-1');
      expect(onToken).toHaveBeenLastCalledWith(null);
    });

    it('resets only the token while the challenge is not drawn yet', async () => {
      const Widget = await load('site-key-1');
      const onToken = vi.fn();
      renderWithProviders(<Widget onToken={onToken} />);

      fireEvent.click(
        screen.getByRole('button', { name: 'Reset the security check' }),
      );

      expect(turnstile.reset).not.toHaveBeenCalled();
      expect(onToken).toHaveBeenLastCalledWith(null);
    });

    it('takes the challenge away with the form, also when taking it away fails', async () => {
      window.turnstile = turnstile;
      const Widget = await load('site-key-1');
      const first = renderWithProviders(<Widget onToken={vi.fn()} />);
      await settle();
      first.unmount();
      expect(turnstile.remove).toHaveBeenCalledWith('widget-1');

      turnstile.remove.mockImplementationOnce(() => {
        throw new Error('already gone');
      });
      const second = renderWithProviders(<Widget onToken={vi.fn()} />);
      await settle();
      expect(() => second.unmount()).not.toThrow();
    });

    it('draws nothing when the form goes away before the script arrives', async () => {
      const Widget = await load('site-key-1');
      const { unmount } = renderWithProviders(<Widget onToken={vi.fn()} />);
      unmount();

      window.turnstile = turnstile;
      await act(async () => script()?.onload?.(new Event('load')));

      expect(turnstile.render).not.toHaveBeenCalled();
    });
  });
});
