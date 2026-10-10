import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LegacyPostRedirect, LegacyTagRedirect } from './LegacyRedirects';

function Post() {
  return <p>post {useParams().id}</p>;
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
      </Routes>
    </MemoryRouter>,
  );

describe('old addresses', () => {
  it('takes an old post address to that same post', async () => {
    open('/post/abc-123');

    expect(await screen.findByText('post abc-123')).toBeInTheDocument();
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
