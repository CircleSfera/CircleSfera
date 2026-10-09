import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportToCSV } from './exportUtils';

describe('exportToCSV', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // What the download would contain, and under which name.
  const exported = async (rows: Record<string, unknown>[]) => {
    let blob: Blob | undefined;
    const createUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((given) => {
        blob = given as Blob;
        return 'blob:csv';
      });
    let name: string | null = null;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        name = this.getAttribute('download');
      });
    exportToCSV('report.csv', rows as Record<string, never>[]);
    return {
      text: blob ? await blob.text() : null,
      type: blob?.type,
      name,
      clicks: click.mock.calls.length,
      urls: createUrl.mock.calls.length,
    };
  };

  it('writes the keys of the first row as the header and one line per row', async () => {
    const out = await exported([
      { name: 'Ana', posts: 3 },
      { name: 'Luis', posts: 0 },
    ]);

    expect(out.text).toBe('name,posts\nAna,3\nLuis,0');
    expect(out.type).toBe('text/csv;charset=utf-8;');
    expect(out.name).toBe('report.csv');
    expect(out.clicks).toBe(1);
  });

  it('quotes a cell with a comma, a quote or a line break, doubling the quotes inside', async () => {
    const out = await exported([
      { a: 'one, two', b: 'she said "hi"', c: 'line\nbreak', d: 'plain' },
    ]);

    expect(out.text).toBe(
      'a,b,c,d\n"one, two","she said ""hi""","line\nbreak",plain',
    );
  });

  it('leaves an empty cell for nothing and writes a date in ISO form', async () => {
    const out = await exported([
      { a: null, b: undefined, when: new Date('2026-03-04T05:06:07.000Z') },
    ]);

    expect(out.text).toBe('a,b,when\n,,2026-03-04T05:06:07.000Z');
  });

  it('downloads nothing when there are no rows', async () => {
    const out = await exported([]);

    expect(out.urls).toBe(0);
    expect(out.clicks).toBe(0);
  });

  it('leaves no link behind in the page', async () => {
    await exported([{ a: 1 }]);
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
