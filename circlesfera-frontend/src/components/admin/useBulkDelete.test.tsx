import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuthApi } from '../../services/admin-auth.service';
import { renderWithProviders } from '../../test/test-utils';
import { useBulkDelete } from './useBulkDelete';

vi.mock('../../services/admin-auth.service', () => ({
  adminAuthApi: { stepUp: vi.fn() },
}));

const remove = vi.fn();
const onDone = vi.fn();
const onToast = vi.fn();
const opened = vi.fn();

function List({ ids }: { ids: string[] }) {
  const bulk = useBulkDelete({ ids, remove, onDone, onToast });
  return (
    <>
      {bulk.bar}
      {ids.map((id) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: stands for a row that opens
        // biome-ignore lint/a11y/useKeyWithClickEvents: stands for a row that opens
        <div key={id} data-testid={`row-${id}`} onClick={() => opened(id)}>
          {bulk.box(id)} item {id}
        </div>
      ))}
      {bulk.dialogs}
    </>
  );
}

const box = (id: string) =>
  within(screen.getByTestId(`row-${id}`)).getByRole('checkbox');
const selectAll = () => screen.getByRole('checkbox', { name: 'Select all' });
const deleteChosen = () =>
  screen.queryByRole('button', { name: 'Delete the chosen' });
const confirm = async () => {
  fireEvent.click(deleteChosen() as HTMLElement);
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
};

describe('deleting several items of a list at once', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    remove.mockResolvedValue({ data: { deleted: 2, failed: 0 } });
  });

  it('offers nothing to delete, and no bar at all for an empty list', () => {
    const { rerender } = renderWithProviders(<List ids={[]} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    rerender(<List ids={['a', 'b']} />);
    expect(selectAll()).not.toBeChecked();
    expect(deleteChosen()).not.toBeInTheDocument();
  });

  it('chooses a row without opening it, and says how many are chosen', () => {
    renderWithProviders(<List ids={['a', 'b', 'c']} />);

    fireEvent.click(box('a'));
    expect(screen.getByText('1 chosen')).toBeInTheDocument();
    fireEvent.click(box('c'));
    expect(screen.getByText('2 chosen')).toBeInTheDocument();
    expect(opened).not.toHaveBeenCalled();
    expect(selectAll()).not.toBeChecked();

    fireEvent.click(box('a'));
    expect(screen.getByText('1 chosen')).toBeInTheDocument();
  });

  it('chooses every row on screen, and none with the next press', () => {
    renderWithProviders(<List ids={['a', 'b']} />);

    fireEvent.click(selectAll());
    expect(box('a')).toBeChecked();
    expect(box('b')).toBeChecked();
    expect(selectAll()).toBeChecked();

    fireEvent.click(selectAll());
    expect(box('a')).not.toBeChecked();
    expect(deleteChosen()).not.toBeInTheDocument();
  });

  it('asks before deleting, sends the chosen, says how many went and empties the choice', async () => {
    renderWithProviders(<List ids={['a', 'b', 'c']} />);
    fireEvent.click(box('a'));
    fireEvent.click(box('c'));

    fireEvent.click(deleteChosen() as HTMLElement);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete 2 items?');
    expect(dialog).toHaveTextContent('It cannot be undone.');
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(remove).not.toHaveBeenCalled();
    expect(box('a')).toBeChecked();

    await confirm();

    await waitFor(() => expect(remove).toHaveBeenCalledWith(['a', 'c']));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('2 deleted', 'success'),
    );
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(box('a')).not.toBeChecked();
  });

  it('says how many could not be deleted, and that nothing was when none went', async () => {
    remove.mockResolvedValueOnce({ data: { deleted: 1, failed: 1 } });
    renderWithProviders(<List ids={['a', 'b']} />);
    fireEvent.click(selectAll());
    await confirm();
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        '1 deleted, 1 could not be',
        'success',
      ),
    );

    remove.mockResolvedValueOnce({ data: { deleted: 0, failed: 2 } });
    fireEvent.click(selectAll());
    await confirm();
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        '0 deleted, 2 could not be',
        'error',
      ),
    );

    remove.mockRejectedValueOnce(new Error('down'));
    fireEvent.click(selectAll());
    await confirm();
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Nothing could be deleted', 'error'),
    );
    expect(box('a')).toBeChecked();
  });

  it('asks for the second confirmation when the server wants it, then deletes', async () => {
    remove
      .mockRejectedValueOnce({
        response: { status: 401, data: { message: 'ADMIN_STEP_UP_REQUIRED' } },
      })
      .mockResolvedValue({ data: { deleted: 1, failed: 0 } });
    vi.mocked(adminAuthApi.stepUp).mockResolvedValue({} as never);
    renderWithProviders(<List ids={['a']} />);
    fireEvent.click(box('a'));
    await confirm();

    const code = await screen.findByPlaceholderText('000000');
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('1 deleted', 'success'),
    );
    expect(remove).toHaveBeenCalledTimes(2);
    expect(adminAuthApi.stepUp).toHaveBeenCalledWith({ totpCode: '123456' });
  });

  it('says nothing and keeps the choice when the code is not given', async () => {
    remove.mockRejectedValue({
      response: { status: 401, data: { message: 'ADMIN_STEP_UP_REQUIRED' } },
    });
    renderWithProviders(<List ids={['a']} />);
    fireEvent.click(box('a'));
    await confirm();

    await screen.findByPlaceholderText('000000');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByPlaceholderText('000000')).not.toBeInTheDocument(),
    );
    expect(onToast).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(box('a')).toBeChecked();
  });

  it('drops from the choice an item that left the screen', () => {
    const { rerender } = renderWithProviders(<List ids={['a', 'b']} />);
    fireEvent.click(selectAll());
    expect(screen.getByText('2 chosen')).toBeInTheDocument();

    rerender(<List ids={['b', 'c']} />);

    expect(screen.getByText('1 chosen')).toBeInTheDocument();
    expect(box('b')).toBeChecked();
    expect(box('c')).not.toBeChecked();
  });
});
