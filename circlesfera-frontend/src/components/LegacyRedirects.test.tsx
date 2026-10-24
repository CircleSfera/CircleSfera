import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import {
  LegacyConversationRedirect,
  LegacyPostRedirect,
  LegacyTagRedirect,
} from './LegacyRedirects';

function Post() {
  return <p>post {useParams().id}</p>;
}
function Conversation() {
  return <p>conversation {useParams().id}</p>;
}
function Tag() {
  return <p>tag {useParams().tag}</p>;
}

const open = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/p/:id" element={<Post />} />
        <Route path="/post/:id" element={<LegacyPostRedirect />} />
        <Route path="/explore/tags/:tag" element={<Tag />} />
        <Route path="/tags/:tag" element={<LegacyTagRedirect />} />
        <Route path="/direct/inbox/t/:id" element={<Conversation />} />
        <Route path="/messages/:id" element={<LegacyConversationRedirect />} />
      </Routes>
    </MemoryRouter>,
  );

describe('old addresses', () => {
  it('takes an old post address to that same post', async () => {
    open('/post/abc-123');

    expect(await screen.findByText('post abc-123')).toBeInTheDocument();
  });

  it('takes an old conversation address to that same conversation', async () => {
    open('/messages/3f817ca6-d144-4f9c-b5b3-1a4b729d3e47');

    expect(
      await screen.findByText(
        'conversation 3f817ca6-d144-4f9c-b5b3-1a4b729d3e47',
      ),
    ).toBeInTheDocument();
  });

  it('takes an old tag address to that same tag', async () => {
    open('/tags/sunset');

    expect(await screen.findByText('tag sunset')).toBeInTheDocument();
  });

  it('keeps a tag with accents or spaces whole', async () => {
    open(`/tags/${encodeURIComponent('año nuevo')}`);

    expect(await screen.findByText('tag año nuevo')).toBeInTheDocument();
  });
});
