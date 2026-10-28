import path from 'node:path';
import { expect, test } from '@playwright/test';
import { HOST, signIn, VIEWER } from './session.js';

const VOICE_NOTE = path.resolve(import.meta.dirname, 'fixtures/voice-note.m4a');

// A voice note sent in a direct message reaches the person it was sent to,
// and its file is served to the two people in the chat only (QF-028,
// QF-037, QF-073).
test('a voice note in a direct message plays for the two people in the chat, and for nobody else', async ({
  browser,
  playwright,
  baseURL,
}) => {
  const host = await signIn(browser, HOST);
  const viewer = await signIn(browser, VIEWER);

  const recipient = (await (await host.get(`/profiles/${VIEWER}`)).json()) as {
    id: string;
  };
  const upload = await host.upload('/uploads', VOICE_NOTE, 'audio/mp4');
  expect(upload.status(), await upload.text()).toBe(201);
  const { url } = (await upload.json()) as { url: string };

  const sent = await host.post('/chat/messages', {
    recipientId: recipient.id,
    content: 'Voice message',
    voiceUrl: url,
    voiceDuration: 2,
  });
  expect(sent.status(), await sent.text()).toBe(201);

  const file = new URL(url, baseURL).pathname;
  for (const person of [host, viewer]) {
    const res = await person.page.request.get(file);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/^audio\//);
  }

  // A visitor who is not signed in, past the site's password only.
  const guest = await playwright.request.newContext({
    baseURL,
    httpCredentials: {
      username: 'circlesfera',
      password: process.env.STAGING_SITE_PASSWORD ?? '',
    },
  });
  expect((await guest.get(file)).status()).not.toBe(200);
  await guest.dispose();

  await host.context.close();
  await viewer.context.close();
});
