import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/test-utils';
import Carousel from './Carousel';

const media = [
  {
    id: 'm1',
    url: 'https://cdn.example/a.jpg',
    type: 'image',
  },
  {
    id: 'm2',
    url: 'https://cdn.example/b.jpg',
    type: 'image',
  },
];

describe('Carousel', () => {
  it('labels the landmark and slide controls from the catalog', () => {
    const { i18n } = renderWithProviders(<Carousel media={media} />);

    expect(
      screen.getByRole('region', { name: i18n!.t('post.media.carousel') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('post.media.next_slide') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', {
        name: i18n!.t('post.media.go_to_slide', { n: 1 }),
      }),
    ).toBeInTheDocument();
  });

  it('uses Spanish slide labels', () => {
    const { i18n } = renderWithProviders(<Carousel media={media} />, {
      lng: 'es',
    });

    expect(i18n!.t('post.media.next_slide')).toBe('Diapositiva siguiente');
    expect(
      screen.getByRole('button', { name: i18n!.t('post.media.next_slide') }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Next slide' }),
    ).not.toBeInTheDocument();
  });
});
