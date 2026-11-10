import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Select } from './Select';

describe('Select', () => {
  it('is 48 px tall, as every field the person fills in', () => {
    render(
      <Select label="Who can mention you" defaultValue="a">
        <option value="a">Everyone</option>
      </Select>,
    );
    expect(screen.getByLabelText('Who can mention you')).toHaveClass('h-12');
  });
});
