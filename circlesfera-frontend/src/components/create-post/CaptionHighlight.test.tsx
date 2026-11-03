import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CaptionHighlight } from './CaptionHighlight';

describe('the copy of a caption being written', () => {
  it('marks each mention and hashtag, and nothing inside a word', () => {
    const { container } = render(
      <CaptionHighlight
        text="Con @ana en #playa, mail ana@x.com"
        className=""
      />,
    );
    const marked = [...container.querySelectorAll('span')].map(
      (s) => s.textContent,
    );
    expect(marked).toEqual(['@ana', '#playa']);
    expect(container.textContent).toContain(
      'Con @ana en #playa, mail ana@x.com',
    );
  });
});
