import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { adminAuthApi } from '../../services/admin-auth.service';
import { renderWithProviders } from '../../test/test-utils';
import PlansTab from './PlansTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: { getPlans: vi.fn(), updatePlan: vi.fn() },
}));
vi.mock('../../services/admin-auth.service', () => ({
  adminAuthApi: { stepUp: vi.fn() },
}));

const premium = {
  id: 'plan-1',
  name: 'Premium',
  description: 'The verified badge',
  priceCents: 999,
  yearlyPriceCents: 9990,
  currency: 'EUR',
  interval: 'month',
  features: ['verified_badge'],
  isActive: true,
  updatedAt: '2026-09-01T10:00:00.000Z',
};
const featureKeys = [
  'verified_badge',
  'no_promoted_content',
  'advanced_analytics',
];
const stepUpRequired = {
  response: { status: 401, data: { code: 'ADMIN_STEP_UP_REQUIRED' } },
};

describe('PlansTab', () => {
  const onToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.getPlans).mockResolvedValue({
      data: { plans: [premium], featureKeys },
    } as never);
  });

  const open = async () => {
    renderWithProviders(<PlansTab onToast={onToast} />);
    return within(await screen.findByRole('region', { name: 'Premium' }));
  };

  it('shows the price of each plan with no way to change it', async () => {
    const plan = await open();

    expect(plan.getByText(/9[.,]99/)).toBeInTheDocument();
    expect(plan.queryByRole('spinbutton')).not.toBeInTheDocument();
    // The only text field is the description.
    expect(plan.getAllByRole('textbox')).toHaveLength(1);
  });

  it('offers only the features the code knows, ticked as the plan has them', async () => {
    const plan = await open();

    const boxes = plan.getAllByRole('checkbox');
    // The switch for "on sale" plus one box per feature.
    expect(boxes).toHaveLength(1 + featureKeys.length);
    expect(plan.getByLabelText('Verification badge')).toBeChecked();
    expect(plan.getByLabelText('Advanced analytics')).not.toBeChecked();
  });

  it('keeps Save disabled until something changes', async () => {
    const plan = await open();
    const save = plan.getByRole('button', { name: 'Save changes' });

    expect(save).toBeDisabled();
    fireEvent.click(plan.getByLabelText('Advanced analytics'));
    expect(save).toBeEnabled();
    fireEvent.click(plan.getByLabelText('Advanced analytics'));
    expect(save).toBeDisabled();
  });

  it('sends only what changed', async () => {
    vi.mocked(adminApi.updatePlan).mockResolvedValue({
      data: premium,
    } as never);
    const plan = await open();

    fireEvent.click(plan.getByLabelText('Advanced analytics'));
    fireEvent.click(plan.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(adminApi.updatePlan).toHaveBeenCalledWith('plan-1', {
        features: ['verified_badge', 'advanced_analytics'],
      }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Plan saved', 'success'),
    );
  });

  it('asks for the authenticator code when the server wants it, then saves', async () => {
    vi.mocked(adminApi.updatePlan)
      .mockRejectedValueOnce(stepUpRequired)
      .mockResolvedValueOnce({ data: premium } as never);
    vi.mocked(adminAuthApi.stepUp).mockResolvedValue({} as never);
    const plan = await open();

    fireEvent.click(plan.getByRole('checkbox', { name: /On sale/ }));
    fireEvent.click(plan.getByRole('button', { name: 'Save changes' }));

    const code = await plan.findByPlaceholderText('000000');
    const confirm = plan.getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(adminAuthApi.stepUp).toHaveBeenCalledWith({ totpCode: '123456' }),
    );
    await waitFor(() => expect(adminApi.updatePlan).toHaveBeenCalledTimes(2));
    expect(adminApi.updatePlan).toHaveBeenLastCalledWith('plan-1', {
      isActive: false,
    });
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Plan saved', 'success'),
    );
  });

  it('does not save when the code is wrong', async () => {
    vi.mocked(adminApi.updatePlan).mockRejectedValueOnce(stepUpRequired);
    vi.mocked(adminAuthApi.stepUp).mockRejectedValue(new Error('bad code'));
    const plan = await open();

    fireEvent.click(plan.getByRole('checkbox', { name: /On sale/ }));
    fireEvent.click(plan.getByRole('button', { name: 'Save changes' }));
    fireEvent.change(await plan.findByPlaceholderText('000000'), {
      target: { value: '000000' },
    });
    fireEvent.click(plan.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(expect.any(String), 'error'),
    );
    expect(adminApi.updatePlan).toHaveBeenCalledTimes(1);
  });
});
