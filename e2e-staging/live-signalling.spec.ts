import { expect, test } from '@playwright/test';
import { HOST, signIn } from './session.js';

// A host on this environment reaches its own live service. The site's
// password, which the browser sends with every request, must not reach the
// live service in place of its token (QF-089).
test('the host of a broadcast connects to the live service, and the broadcast ends', async ({
  browser,
}) => {
  const host = await signIn(browser, HOST);
  // A broadcast left open by an earlier run is ended first.
  await host.post('/live/end');

  const start = await host.post('/live/start', { title: 'Staging check' });
  expect(start.status()).toBe(201);
  const { token, stream } = (await start.json()) as {
    token: string;
    stream: { id: string };
  };

  try {
    const opened = await host.page.evaluate(
      (accessToken) =>
        new Promise<string>((resolve) => {
          const socket = new WebSocket(
            `wss://${location.host}/rtc?access_token=${accessToken}&auto_subscribe=1&protocol=16`,
          );
          socket.onopen = () => {
            socket.close();
            resolve('open');
          };
          socket.onerror = () => resolve('error');
          setTimeout(() => resolve('timeout'), 10_000);
        }),
      token,
    );
    expect(opened).toBe('open');
  } finally {
    expect((await host.post('/live/end')).status()).toBe(201);
  }

  const active = (await (await host.get('/live/active')).json()) as Array<{
    id: string;
  }>;
  expect(active.map((live) => live.id)).not.toContain(stream.id);
  await host.context.close();
});
