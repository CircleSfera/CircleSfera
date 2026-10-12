import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuthApi } from '../../services/admin-auth.service';
import { renderWithProviders } from '../../test/test-utils';
import {
  isStepUpCancelled,
  isStepUpRequired,
  useAdminStepUp,
} from './useAdminStepUp';

vi.mock('../../services/admin-auth.service', () => ({
  adminAuthApi: { stepUp: vi.fn() },
}));

const asksToConfirm = {
  response: { status: 401, data: { message: 'ADMIN_STEP_UP_REQUIRED' } },
};
const action = vi.fn();
const done = vi.fn();
const failed = vi.fn();

function Screen() {
  const stepUp = useAdminStepUp();
  return (
    <>
      <button
        type="button"
        onClick={() => stepUp.run(() => action()).then(done, failed)}
      >
        Delete
      </button>
      {stepUp.dialog}
    </>
  );
}

const start = () => {
  renderWithProviders(<Screen />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
};
const type = (code: string) =>
  fireEvent.change(screen.getByRole('textbox'), { target: { value: code } });

describe('the second confirmation of a staff member', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminAuthApi.stepUp).mockResolvedValue({} as never);
  });

  it('tells the answer that asks for it from any other refusal', () => {
    expect(isStepUpRequired(asksToConfirm)).toBe(true);
    expect(
      isStepUpRequired({
        response: { status: 401, data: { message: 'Unauthorized' } },
      }),
    ).toBe(false);
    expect(
      isStepUpRequired({
        response: { status: 403, data: { message: 'ADMIN_STEP_UP_REQUIRED' } },
      }),
    ).toBe(false);
    expect(isStepUpCancelled(new Error('no'))).toBe(false);
  });

  it('runs an action the server does not protect without asking anything', async () => {
    action.mockResolvedValue('ok');
    start();

    await waitFor(() => expect(done).toHaveBeenCalledWith('ok'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(adminAuthApi.stepUp).not.toHaveBeenCalled();
  });

  it('passes on a failure that is not a request to confirm', async () => {
    const down = new Error('down');
    action.mockRejectedValue(down);
    start();

    await waitFor(() => expect(failed).toHaveBeenCalledWith(down));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks for the code, takes only its six digits, and goes on with the action', async () => {
    action.mockRejectedValueOnce(asksToConfirm).mockResolvedValue('deleted');
    start();

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Confirm it is you');
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus());
    expect(confirm).toBeDisabled();

    type('12a 34');
    expect(screen.getByRole('textbox')).toHaveValue('1234');
    expect(confirm).toBeDisabled();
    type('1234567');
    expect(screen.getByRole('textbox')).toHaveValue('123456');
    fireEvent.click(confirm);

    await waitFor(() => expect(done).toHaveBeenCalledWith('deleted'));
    expect(adminAuthApi.stepUp).toHaveBeenCalledWith({ totpCode: '123456' });
    expect(action).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says a code is wrong and keeps waiting for a right one', async () => {
    action.mockRejectedValueOnce(asksToConfirm).mockResolvedValue('deleted');
    vi.mocked(adminAuthApi.stepUp).mockRejectedValueOnce(new Error('no'));
    start();
    await screen.findByRole('dialog');

    type('000000');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That code is not right',
    );
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(action).toHaveBeenCalledTimes(1);
    expect(done).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();

    type('654321');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(done).toHaveBeenCalledWith('deleted'));
  });

  it('leaves everything as it was on Cancel, with an error the caller can tell apart', async () => {
    action.mockRejectedValue(asksToConfirm);
    start();
    await screen.findByRole('dialog');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(failed).toHaveBeenCalledTimes(1));
    expect(isStepUpCancelled(failed.mock.calls[0][0])).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(adminAuthApi.stepUp).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('passes on what the action answers after the confirmation, a refusal included', async () => {
    const conflict = { response: { status: 409, data: {} } };
    action.mockRejectedValueOnce(asksToConfirm).mockRejectedValue(conflict);
    start();
    await screen.findByRole('dialog');

    type('123456');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(failed).toHaveBeenCalledWith(conflict));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
