import { act, fireEvent, screen, within } from '@testing-library/react';
import { Ban, Users } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { AdminList, AdminListRow } from './AdminList';
import {
  ActionButton,
  FilterDropdown,
  Pagination,
  SearchInput,
  StatusBadge,
  Table,
} from './AdminTable';
import StatCard from './StatCard';

describe('AdminListRow', () => {
  const actions = () => [
    { label: 'View', onClick: vi.fn(), icon: Users },
    {
      label: 'Ban',
      onClick: vi.fn(),
      variant: 'danger' as const,
      dividerBefore: true,
      icon: Ban,
    },
    { label: 'Export', onClick: vi.fn(), disabled: true },
  ];
  const more = () => screen.getByRole('button', { name: 'More actions' });

  it('shows what it is given: title, subtitle, details, badge, picture and main action', () => {
    renderWithProviders(
      <AdminListRow
        title="Ana"
        subtitle="@ana"
        meta={<span>joined in May</span>}
        badge={<span>active</span>}
        avatar={<img alt="Ana" />}
        primaryAction={<button type="button">Open</button>}
      />,
    );

    for (const text of ['Ana', '@ana', 'joined in May', 'active']) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByRole('img', { name: 'Ana' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'More actions' }),
    ).not.toBeInTheDocument();
  });

  it('is a plain row when it cannot be opened', () => {
    const { container } = renderWithProviders(<AdminListRow title="Ana" />);
    expect(container.firstElementChild).not.toHaveAttribute('role');
    expect(container.firstElementChild).not.toHaveAttribute('tabindex');
  });

  it('opens with a press, with Enter and with Space, and says when it is the one selected', () => {
    const onClick = vi.fn();
    renderWithProviders(
      <AdminListRow title="Ana" onClick={onClick} selected />,
    );
    const row = screen.getByRole('button', { name: 'Ana' });
    expect(row).toHaveAttribute('aria-current', 'true');

    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    fireEvent.keyDown(row, { key: 'a' });

    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('does not open the row when one of its actions is used', () => {
    const onClick = vi.fn();
    const onOpen = vi.fn();
    renderWithProviders(
      <AdminListRow
        title="Ana"
        onClick={onClick}
        primaryAction={
          <button type="button" onClick={onOpen}>
            Open
          </button>
        }
        secondaryActions={actions()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open' }), {
      key: 'Enter',
    });
    fireEvent.click(more());

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  describe('its menu of further actions', () => {
    const openMenu = (given = actions()) => {
      renderWithProviders(
        <AdminListRow title="Ana" secondaryActions={given} />,
      );
      fireEvent.click(more());
      return given;
    };

    it('opens under the button and lists the actions, the unavailable one switched off', () => {
      openMenu();

      const menu = screen.getByRole('menu');
      expect(more()).toHaveAttribute('aria-expanded', 'true');
      expect(
        within(menu)
          .getAllByRole('menuitem')
          .map((i) => i.textContent),
      ).toEqual(['View', 'Ban', 'Export']);
      expect(
        within(menu).getByRole('menuitem', { name: 'Export' }),
      ).toBeDisabled();
    });

    it('does the chosen action and closes', () => {
      const given = openMenu();

      fireEvent.click(screen.getByRole('menuitem', { name: 'Ban' }));

      expect(given[1].onClick).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('closes with Escape, with a press outside and from its own button, not with a press inside', () => {
      openMenu();
      fireEvent.mouseDown(screen.getByRole('menu'));
      expect(screen.getByRole('menu')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();

      fireEvent.click(more());
      fireEvent.keyDown(document, { key: 'a' });
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();

      fireEvent.click(more());
      fireEvent.mouseDown(more());
      fireEvent.click(more());
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('opens upwards when there is no room under the button, and follows the page', () => {
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: 600,
      });
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 400,
      });
      renderWithProviders(
        <AdminListRow title="Ana" secondaryActions={actions()} />,
      );
      more().getBoundingClientRect = () =>
        ({ top: 540, bottom: 584, right: 380, left: 336 }) as DOMRect;

      fireEvent.click(more());
      const menu = screen.getByRole('menu');
      expect(menu.style.bottom).toBe('64px');
      expect(menu.style.top).toBe('');
      expect(menu.style.left).toBe('160px');

      more().getBoundingClientRect = () =>
        ({ top: 100, bottom: 144, right: 60, left: 16 }) as DOMRect;
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });
      expect(screen.getByRole('menu').style.top).toBe('148px');
      expect(screen.getByRole('menu').style.left).toBe('8px');
    });
  });
});

describe('AdminList', () => {
  const lists = { mobile: <p>cards</p>, desktop: <p>table</p> };

  it('shows both layouts, one for each width', () => {
    renderWithProviders(<AdminList {...lists} className="mt-2" />);
    expect(screen.getByText('cards').parentElement?.className).toContain(
      'lg:hidden',
    );
    expect(screen.getByText('table').parentElement?.className).toContain(
      'lg:block',
    );
  });

  it('shows placeholders while loading', () => {
    const { container } = renderWithProviders(<AdminList {...lists} loading />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(4);
    expect(screen.queryByText('cards')).not.toBeInTheDocument();
  });

  it('says there is nothing, in its own words or in the given ones, with the action it is given', () => {
    const plain = renderWithProviders(<AdminList {...lists} isEmpty />);
    expect(
      screen.getByText(plain.i18n!.t('admin.table.empty_title')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(plain.i18n!.t('admin.table.empty_description')),
    ).toBeInTheDocument();
    plain.unmount();

    renderWithProviders(
      <AdminList
        {...lists}
        isEmpty
        emptyTitle="No reports"
        emptyDescription="All clear"
        emptyAction={<button type="button">Refresh</button>}
      />,
    );
    expect(screen.getByText('No reports')).toBeInTheDocument();
    expect(screen.getByText('All clear')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });
});

describe('StatCard', () => {
  let frames: FrameRequestCallback[] = [];
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) =>
      frames.push(run),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(performance, 'now').mockReturnValue(0);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  /** Lets the count run to a moment, in ms. */
  const runTo = (ms: number) =>
    act(() => {
      for (const run of frames.splice(0)) run(ms);
    });

  it('counts up to its figure', () => {
    renderWithProviders(
      <StatCard label="Accounts" value={1200} icon={Users} color="blue" />,
    );
    expect(screen.getByText('0')).toBeInTheDocument();

    runTo(400);
    expect(screen.getByText('1,050')).toBeInTheDocument();
    expect(frames).toHaveLength(1);

    runTo(800);
    expect(screen.getByText('1,200')).toBeInTheDocument();
    expect(frames).toHaveLength(0);
  });

  it('shows the figure at once when it is not a counter, with what goes before and after it', () => {
    renderWithProviders(
      <StatCard
        label="Income"
        value={1200}
        icon={Users}
        color="green"
        isCounter={false}
        prefix="€"
        suffix="/mo"
        subtitle="this month"
      />,
    );
    expect(screen.getByText('€1,200/mo')).toBeInTheDocument();
    expect(screen.getByText('this month')).toBeInTheDocument();
  });

  it.each([
    [12, '+12%', 'text-emerald-400'],
    [-3, '-3%', 'text-rose-400'],
    [0, '0%', 'text-white/40'],
  ])('shows a change of %s as %s', (growth, text, tone) => {
    renderWithProviders(
      <StatCard
        label="Accounts"
        value={5}
        icon={Users}
        color="red"
        growth={growth}
      />,
    );
    expect(screen.getByText(text).parentElement?.className).toContain(tone);
  });

  it('shows no change when it is not known', () => {
    renderWithProviders(
      <StatCard
        label="Accounts"
        value={5}
        icon={Users}
        color="pink"
        growth={null}
      />,
    );
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('draws the line of the last days from the lowest to the highest', () => {
    const { container } = renderWithProviders(
      <StatCard
        label="Accounts"
        value={5}
        icon={Users}
        color="purple"
        sparklineData={[10, 20, 15]}
      />,
    );
    const path = container.querySelector(
      'svg[aria-hidden="true"] path',
    ) as SVGPathElement;
    expect(path.getAttribute('d')).toBe('M 0,100 L 50,0 L 100,50');
    expect(path.getAttribute('stroke')).toBe('#884cff');
  });

  it('draws a flat line for equal figures, and none for a single one', () => {
    const flat = renderWithProviders(
      <StatCard
        label="Accounts"
        value={5}
        icon={Users}
        color="yellow"
        sparklineData={[7, 7]}
      />,
    );
    expect(
      flat.container.querySelector('path[stroke="#fbbf24"]')?.getAttribute('d'),
    ).toBe('M 0,100 L 100,100');
    flat.unmount();

    const single = renderWithProviders(
      <StatCard
        label="Accounts"
        value={5}
        icon={Users}
        color="yellow"
        sparklineData={[7]}
      />,
    );
    expect(single.container.querySelector('path[stroke="#fbbf24"]')).toBeNull();
  });
});

describe('the pieces of a staff table', () => {
  describe('Table', () => {
    const headers = ['Account', <span key="h">Status</span>];

    it('shows its headings and rows', () => {
      renderWithProviders(
        <Table
          headers={headers}
          columnWidths={['w-40', 'w-20']}
          loading={false}
          isEmpty={false}
        >
          <tr>
            <td>ana</td>
          </tr>
        </Table>,
      );
      expect(
        screen.getByRole('columnheader', { name: 'Account' }).className,
      ).toContain('w-40');
      expect(
        screen.getByRole('columnheader', { name: 'Status' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: 'ana' })).toBeInTheDocument();
    });

    it('shows five placeholder rows while loading, a cell for each heading', () => {
      const { container } = renderWithProviders(
        <Table headers={headers} loading isEmpty={false}>
          <tr />
        </Table>,
      );
      expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
      expect(container.querySelectorAll('tbody td')).toHaveLength(10);
    });

    it('says there is nothing across the whole width', () => {
      const { i18n } = renderWithProviders(
        <Table headers={headers} loading={false} isEmpty>
          <tr />
        </Table>,
      );
      expect(
        screen.getByText(i18n!.t('admin.table.empty_title')),
      ).toBeInTheDocument();
      expect(screen.getByRole('cell')).toHaveAttribute('colspan', '2');
    });
  });

  it.each([
    ['BANNED', 'text-red-400'],
    ['Resolved', 'text-green-400'],
    ['valid', 'text-brand-blue'],
    ['DISMISSED', 'text-white/45'],
    ['something else', 'text-yellow-400'],
  ])('paints the status "%s"', (status, tone) => {
    renderWithProviders(<StatusBadge status={status} />);
    expect(screen.getByText(status).className).toContain(tone);
  });

  describe('ActionButton', () => {
    it('shows its label and acts', () => {
      const onClick = vi.fn();
      renderWithProviders(
        <ActionButton
          label="Ban"
          variant="danger"
          icon={Ban}
          onClick={onClick}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Ban' }));
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Ban' })).toHaveTextContent(
        'Ban',
      );
    });

    it('keeps its name when it only shows an icon', () => {
      renderWithProviders(
        <ActionButton
          label="Ban"
          variant="warning"
          icon={Ban}
          iconOnly
          onClick={vi.fn()}
        />,
      );
      const button = screen.getByRole('button', { name: 'Ban' });
      expect(button).toHaveTextContent('');
      expect(button).toHaveAttribute('title', 'Ban');
    });

    it('says it is working and takes no press meanwhile, nor while switched off', () => {
      const onClick = vi.fn();
      const busy = renderWithProviders(
        <ActionButton
          label="Ban"
          variant="primary"
          loading
          onClick={onClick}
        />,
      );
      expect(screen.getByRole('button', { name: 'Ban' })).toHaveTextContent(
        busy.i18n!.t('admin.table.loading'),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Ban' }));
      busy.unmount();

      renderWithProviders(
        <ActionButton
          label="Ban"
          variant="success"
          disabled
          onClick={onClick}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Ban' }));
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('Pagination', () => {
    const meta = (page: number, total = 45) => ({
      total,
      page,
      limit: 20,
      totalPages: Math.ceil(total / 20),
    });

    it('is not there without figures', () => {
      const { container } = renderWithProviders(
        <Pagination onPageChange={vi.fn()} />,
      );
      expect(container).toBeEmptyDOMElement();
    });

    it('says which results are on the page and moves both ways', () => {
      const onPageChange = vi.fn();
      const { i18n } = renderWithProviders(
        <Pagination meta={meta(2)} onPageChange={onPageChange} />,
      );
      expect(
        screen.getByText(
          i18n!.t('admin.table.pagination_from_to', {
            from: 21,
            to: 40,
            total: 45,
          }),
        ),
      ).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole('button', { name: i18n!.t('admin.table.prev_page') }),
      );
      fireEvent.click(
        screen.getByRole('button', { name: i18n!.t('admin.table.next_page') }),
      );
      expect(onPageChange.mock.calls).toEqual([[1], [3]]);
    });

    it('stops at both ends, and counts the last page to its real end', () => {
      const first = renderWithProviders(
        <Pagination meta={meta(1)} onPageChange={vi.fn()} />,
      );
      expect(
        screen.getByRole('button', {
          name: first.i18n!.t('admin.table.prev_page'),
        }),
      ).toBeDisabled();
      first.unmount();

      const last = renderWithProviders(
        <Pagination meta={meta(3)} onPageChange={vi.fn()} />,
      );
      expect(
        screen.getByRole('button', {
          name: last.i18n!.t('admin.table.next_page'),
        }),
      ).toBeDisabled();
      expect(
        screen.getByText(
          last.i18n!.t('admin.table.pagination_from_to', {
            from: 41,
            to: 45,
            total: 45,
          }),
        ),
      ).toBeInTheDocument();
    });

    it('offers no page buttons for a single page, and says so when there is nothing', () => {
      const one = renderWithProviders(
        <Pagination meta={meta(1, 5)} onPageChange={vi.fn()} />,
      );
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      one.unmount();

      const none = renderWithProviders(
        <Pagination
          meta={{ total: 0, page: 1, limit: 20, totalPages: 0 }}
          onPageChange={vi.fn()}
        />,
      );
      expect(
        screen.getByText(
          none.i18n!.t('admin.table.results_count', { count: 0 }),
        ),
      ).toBeInTheDocument();
    });
  });

  it('gives each filter its own id, so two can share a screen', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <>
        <FilterDropdown
          label="Status"
          value="all"
          onChange={onChange}
          options={[
            { value: 'all', label: 'All' },
            { value: 'banned', label: 'Banned' },
          ]}
        />
        <FilterDropdown
          label="Role"
          value="any"
          onChange={vi.fn()}
          options={[{ value: 'any', label: 'Any' }]}
        />
      </>,
    );
    const status = screen.getByRole('combobox', { name: 'Status' });
    const role = screen.getByRole('combobox', { name: 'Role' });
    expect(status.id).not.toBe(role.id);

    fireEvent.change(status, { target: { value: 'banned' } });
    expect(onChange).toHaveBeenCalledWith('banned');
  });

  it('names the search field by what it looks for', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <SearchInput
        value=""
        onChange={onChange}
        placeholder="Search accounts"
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Search accounts' }), {
      target: { value: 'ana' },
    });

    expect(onChange).toHaveBeenCalledWith('ana');
  });
});
