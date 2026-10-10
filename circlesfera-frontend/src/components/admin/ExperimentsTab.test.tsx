import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import ExperimentsTab from './ExperimentsTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getFeatureFlags: vi.fn(),
    upsertFeatureFlag: vi.fn(),
    deleteFeatureFlag: vi.fn(),
    getUserExperiments: vi.fn(),
    assignUserExperiment: vi.fn(),
    removeUserExperiment: vi.fn(),
    getUsers: vi.fn(),
  },
}));
vi.mock('../../hooks/useDebouncedValue', () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const api = vi.mocked(adminApi);

const flag = (id: string, over: object = {}) => ({
  id,
  key: `flag_${id}`,
  name: `Flag ${id}`,
  description: null,
  isEnabled: true,
  percentage: 40,
  createdAt: '2026-03-01T10:00:00Z',
  updatedAt: '2026-03-05T10:00:00Z',
  ...over,
});
const entry = (id: string, over: object = {}) => ({
  id,
  userId: `user-${id}`,
  experimentKey: `experiment_${id}`,
  variant: 'treatment',
  createdAt: '2026-03-02T10:00:00Z',
  user: {
    id: `user-${id}`,
    profile: { username: `person_${id}`, avatar: null, fullName: null },
  },
  ...over,
});
const list = <T,>(rows: T[], pageNumber = 1, totalPages = 1) => ({
  data: {
    data: rows,
    meta: {
      total: rows.length * totalPages,
      page: pageNumber,
      limit: 20,
      totalPages,
    },
  },
});
const person = (id: string, over: object = {}) => ({
  id,
  email: `${id}@example.com`,
  profile: { username: `person_${id}`, avatar: null },
  ...over,
});

const show = () => renderWithProviders(<ExperimentsTab />);
const cardOf = (name: string) =>
  screen.getByText(name).closest('.rounded-xl') as HTMLElement;
const rowOf = (text: string) =>
  screen
    .getAllByText(text)
    .map((el) => el.closest('[role="button"]'))
    .find(Boolean) as HTMLElement;
const detail = () => screen.getByRole('region', { name: 'Detail' });
const dialog = () => screen.getByRole('dialog');
const openAssignments = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'A/B Experiments' }));
  await screen.findAllByRole('heading', { name: 'A/B Experiments' });
};

describe('ExperimentsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getFeatureFlags.mockResolvedValue({ data: [] } as never);
    api.upsertFeatureFlag.mockResolvedValue({} as never);
    api.deleteFeatureFlag.mockResolvedValue({} as never);
    api.getUserExperiments.mockResolvedValue(list([]) as never);
    api.assignUserExperiment.mockResolvedValue({} as never);
    api.removeUserExperiment.mockResolvedValue({} as never);
    api.getUsers.mockResolvedValue(list([]) as never);
  });

  describe('feature flags', () => {
    it('offers to create the first flag when there is none', async () => {
      show();

      expect(
        await screen.findByText('No feature flags configured.'),
      ).toBeInTheDocument();
      expect(
        screen.getAllByRole('button', { name: 'New Flag' }).length,
      ).toBeGreaterThanOrEqual(2);
    });

    it('lists each flag with its key, description and how far it reaches', async () => {
      api.getFeatureFlags.mockResolvedValue({
        data: [
          flag('a', { description: 'A new way to order the feed' }),
          flag('b', { isEnabled: false }),
          flag('c', { percentage: 100 }),
          flag('d', { percentage: 0 }),
        ],
      } as never);
      show();

      const first = await waitFor(() => cardOf('Flag a'));
      expect(within(first).getByText('flag_a')).toBeInTheDocument();
      expect(
        within(first).getByText('A new way to order the feed'),
      ).toBeInTheDocument();
      expect(within(first).getByText(/Active · 40%/)).toBeInTheDocument();
      expect(within(cardOf('Flag b')).getByText('Off')).toBeInTheDocument();
      expect(
        within(cardOf('Flag c')).getByText('Full rollout'),
      ).toBeInTheDocument();
      expect(
        within(cardOf('Flag d')).getByText('No reach'),
      ).toBeInTheDocument();
    });

    it('saves a new percentage from the card, and only once it changed', async () => {
      api.getFeatureFlags.mockResolvedValue({ data: [flag('a')] } as never);
      show();

      const card = await waitFor(() => cardOf('Flag a'));
      const save = within(card).getByRole('button', { name: 'Save' });
      expect(save).toBeDisabled();

      fireEvent.change(within(card).getByRole('slider'), {
        target: { value: '65' },
      });
      expect(within(card).getByText(/Active · 65%/)).toBeInTheDocument();
      fireEvent.click(save);

      await waitFor(() =>
        expect(api.upsertFeatureFlag).toHaveBeenCalledWith('flag_a', {
          isEnabled: true,
          percentage: 65,
        }),
      );
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Flag saved'),
      );
    });

    it('keeps a typed percentage between 0 and 100', async () => {
      api.getFeatureFlags.mockResolvedValue({ data: [flag('a')] } as never);
      show();

      const card = await waitFor(() => cardOf('Flag a'));
      const typed = within(card).getByRole('spinbutton');
      fireEvent.change(typed, { target: { value: '250' } });
      expect(typed).toHaveValue(100);
      fireEvent.change(typed, { target: { value: '-4' } });
      expect(typed).toHaveValue(0);
      fireEvent.change(typed, { target: { value: '' } });
      expect(typed).toHaveValue(0);
    });

    it('asks before switching off a flag that reaches people, and leaves it on when cancelled', async () => {
      api.getFeatureFlags.mockResolvedValue({ data: [flag('a')] } as never);
      show();

      const card = await waitFor(() => cardOf('Flag a'));
      const enabled = within(card).getByRole('checkbox', { name: 'Enabled' });
      fireEvent.click(enabled);

      expect(
        within(dialog()).getByText(
          'This flag is active with 40% rollout. Deactivating it will affect included users.',
        ),
      ).toBeInTheDocument();
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));

      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(enabled).toBeChecked();
      expect(within(card).getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('switches it off once confirmed, and saves it', async () => {
      api.getFeatureFlags.mockResolvedValue({ data: [flag('a')] } as never);
      show();

      const card = await waitFor(() => cardOf('Flag a'));
      fireEvent.click(within(card).getByRole('checkbox', { name: 'Enabled' }));
      fireEvent.click(
        within(dialog()).getByRole('button', { name: 'Deactivate' }),
      );

      expect(await within(card).findByText('Off')).toBeInTheDocument();
      fireEvent.click(within(card).getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(api.upsertFeatureFlag).toHaveBeenCalledWith('flag_a', {
          isEnabled: false,
          percentage: 40,
        }),
      );
    });

    it('switches a flag on, or off when it reaches nobody, without asking', async () => {
      api.getFeatureFlags.mockResolvedValue({
        data: [flag('a', { isEnabled: false }), flag('b', { percentage: 0 })],
      } as never);
      show();

      const off = await waitFor(() => cardOf('Flag a'));
      fireEvent.click(within(off).getByRole('checkbox', { name: 'Enabled' }));
      expect(within(off).getByText(/Active · 40%/)).toBeInTheDocument();

      const nobody = cardOf('Flag b');
      fireEvent.click(
        within(nobody).getByRole('checkbox', { name: 'Enabled' }),
      );
      expect(within(nobody).getByText('Off')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('creates a flag only with a valid key and a name', async () => {
      show();
      await screen.findByText('No feature flags configured.');
      fireEvent.click(screen.getAllByRole('button', { name: 'New Flag' })[0]);

      const form = detail();
      const save = within(form).getByRole('button', { name: 'Save' });
      expect(save).toBeDisabled();

      fireEvent.change(within(form).getByLabelText('Key'), {
        target: { value: 'New Feed' },
      });
      fireEvent.change(within(form).getByLabelText('Name'), {
        target: { value: 'New feed' },
      });
      expect(
        within(form).getByText(
          'Only lowercase letters, digits and underscores. Min 2, max 80 characters.',
        ),
      ).toBeInTheDocument();
      expect(save).toBeDisabled();

      fireEvent.change(within(form).getByLabelText('Key'), {
        target: { value: 'new_feed' },
      });
      fireEvent.change(within(form).getByLabelText('Description'), {
        target: { value: 'Orders the feed another way' },
      });
      fireEvent.change(within(form).getByRole('spinbutton'), {
        target: { value: '10' },
      });
      fireEvent.click(within(form).getByRole('checkbox', { name: 'Enabled' }));
      fireEvent.click(save);

      await waitFor(() =>
        expect(api.upsertFeatureFlag).toHaveBeenCalledWith('new_feed', {
          name: 'New feed',
          description: 'Orders the feed another way',
          percentage: 10,
          isEnabled: true,
        }),
      );
      await waitFor(() =>
        expect(
          within(detail()).queryByLabelText('Key'),
        ).not.toBeInTheDocument(),
      );
    });

    it('edits a flag with its key fixed, and can empty its description', async () => {
      api.getFeatureFlags.mockResolvedValue({
        data: [flag('a', { description: 'Old words' })],
      } as never);
      show();

      const card = await waitFor(() => cardOf('Flag a'));
      fireEvent.click(within(card).getByRole('button', { name: 'Edit Flag' }));

      const form = detail();
      expect(within(form).getByLabelText('Key')).toBeDisabled();
      expect(within(form).getByLabelText('Key')).toHaveValue('flag_a');
      fireEvent.change(within(form).getByLabelText('Description'), {
        target: { value: '' },
      });
      fireEvent.click(within(form).getByRole('button', { name: 'Save' }));

      await waitFor(() =>
        expect(api.upsertFeatureFlag).toHaveBeenCalledWith('flag_a', {
          name: 'Flag a',
          description: '',
          percentage: 40,
          isEnabled: true,
        }),
      );
    });

    it('shows on the card what was saved from the form, with nothing left to save', async () => {
      api.getFeatureFlags.mockResolvedValue({ data: [flag('a')] } as never);
      show();

      const card = await waitFor(() => cardOf('Flag a'));
      fireEvent.click(within(card).getByRole('button', { name: 'Edit Flag' }));
      fireEvent.change(within(detail()).getByRole('spinbutton'), {
        target: { value: '90' },
      });
      api.getFeatureFlags.mockResolvedValue({
        data: [flag('a', { percentage: 90 })],
      } as never);
      fireEvent.click(within(detail()).getByRole('button', { name: 'Save' }));

      expect(
        await within(cardOf('Flag a')).findByText(/Active · 90%/),
      ).toBeInTheDocument();
      expect(
        within(cardOf('Flag a')).getByRole('button', { name: 'Save' }),
      ).toBeDisabled();
    });

    it('closes the form on Cancel without saving', async () => {
      show();
      await screen.findByText('No feature flags configured.');
      fireEvent.click(screen.getAllByRole('button', { name: 'New Flag' })[1]);
      fireEvent.click(within(detail()).getByRole('button', { name: 'Cancel' }));

      expect(within(detail()).queryByLabelText('Key')).not.toBeInTheDocument();
      expect(api.upsertFeatureFlag).not.toHaveBeenCalled();
    });

    it('deletes a flag after confirming, and not when cancelled', async () => {
      api.getFeatureFlags.mockResolvedValue({ data: [flag('a')] } as never);
      show();

      const card = await waitFor(() => cardOf('Flag a'));
      fireEvent.click(
        within(card).getByRole('button', { name: 'Delete Flag' }),
      );
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(api.deleteFeatureFlag).not.toHaveBeenCalled();

      fireEvent.click(
        within(card).getByRole('button', { name: 'Delete Flag' }),
      );
      fireEvent.click(
        within(dialog()).getByRole('button', { name: 'Delete Flag' }),
      );
      await waitFor(() =>
        expect(api.deleteFeatureFlag).toHaveBeenCalledWith('flag_a'),
      );
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Flag deleted'),
      );
    });

    it('says so when a flag could not be saved or deleted', async () => {
      api.getFeatureFlags.mockResolvedValue({ data: [flag('a')] } as never);
      api.upsertFeatureFlag.mockRejectedValue(new Error('no'));
      api.deleteFeatureFlag.mockRejectedValue(new Error('no'));
      show();

      const card = await waitFor(() => cardOf('Flag a'));
      fireEvent.change(within(card).getByRole('slider'), {
        target: { value: '5' },
      });
      fireEvent.click(within(card).getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('The flag could not be saved'),
      );
      // What was being changed stays, to try again.
      expect(within(card).getByText(/Active · 5%/)).toBeInTheDocument();

      fireEvent.click(
        within(card).getByRole('button', { name: 'Delete Flag' }),
      );
      fireEvent.click(
        within(dialog()).getByRole('button', { name: 'Delete Flag' }),
      );
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'The flag could not be deleted',
        ),
      );
    });
  });

  describe('assignments', () => {
    it('marks which of the two sections is open', async () => {
      show();
      const flags = screen.getByRole('button', { name: 'Feature Flags' });
      const assignments = screen.getByRole('button', {
        name: 'A/B Experiments',
      });
      expect(flags).toHaveAttribute('aria-pressed', 'true');
      expect(assignments).toHaveAttribute('aria-pressed', 'false');

      await openAssignments();
      expect(flags).toHaveAttribute('aria-pressed', 'false');
      expect(assignments).toHaveAttribute('aria-pressed', 'true');
    });

    it('offers to assign the first one when there is none', async () => {
      show();
      await openAssignments();

      expect(await screen.findByText('No experiments')).toBeInTheDocument();
      expect(
        screen.getAllByRole('button', { name: 'Assign Experiment' }).length,
      ).toBeGreaterThanOrEqual(2);
    });

    it('lists who is in which experiment and with which variant', async () => {
      api.getUserExperiments.mockResolvedValue(
        list([
          entry('1'),
          entry('2', { variant: 'control' }),
          entry('3', { user: null }),
        ]) as never,
      );
      show();
      await openAssignments();

      const row = await waitFor(() => rowOf('@person_1'));
      expect(within(row).getByText('experiment_1')).toBeInTheDocument();
      expect(within(row).getByText('treatment')).toHaveClass('text-green-400');
      expect(within(rowOf('@person_2')).getByText('control')).toHaveClass(
        'text-orange-400',
      );
      expect(rowOf('@Unknown')).toBeTruthy();
    });

    it('searches from the first page and moves between pages', async () => {
      api.getUserExperiments.mockResolvedValue(
        list([entry('1')], 1, 3) as never,
      );
      show();
      await openAssignments();
      await waitFor(() => rowOf('@person_1'));

      fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
      await waitFor(() =>
        expect(api.getUserExperiments).toHaveBeenLastCalledWith(
          2,
          20,
          undefined,
        ),
      );

      fireEvent.change(
        screen.getByRole('textbox', {
          name: 'Search by username or experiment key...',
        }),
        { target: { value: 'beta' } },
      );
      await waitFor(() =>
        expect(api.getUserExperiments).toHaveBeenLastCalledWith(1, 20, 'beta'),
      );
    });

    it('assigns a person found by name to an experiment', async () => {
      api.getUsers.mockResolvedValue(
        list([person('abcdefgh-1'), person('zzzzzzzz-2')]) as never,
      );
      show();
      await openAssignments();
      await screen.findByText('No experiments');
      fireEvent.click(
        screen.getAllByRole('button', { name: 'Assign Experiment' })[0],
      );

      const form = detail();
      const save = within(form).getByRole('button', { name: 'Save' });
      expect(save).toBeDisabled();

      const who = within(form).getByPlaceholderText(
        'Search user by name or email...',
      );
      fireEvent.change(who, { target: { value: 'p' } });
      expect(api.getUsers).not.toHaveBeenCalled();
      fireEvent.change(who, { target: { value: 'per' } });
      await waitFor(() =>
        expect(api.getUsers).toHaveBeenCalledWith(1, 8, 'per'),
      );
      fireEvent.click(
        await within(form).findByRole('button', {
          name: /@person_abcdefgh-1/,
        }),
      );
      expect(who).toHaveValue('@person_abcdefgh-1 (abcdefgh…)');

      fireEvent.change(within(form).getByLabelText('Experiment Key'), {
        target: { value: 'beta_feature' },
      });
      fireEvent.change(within(form).getByLabelText('Variant'), {
        target: { value: 'control' },
      });
      fireEvent.click(save);

      await waitFor(() =>
        expect(api.assignUserExperiment).toHaveBeenCalledWith(
          'abcdefgh-1',
          'beta_feature',
          'control',
        ),
      );
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Assignment saved'),
      );
    });

    it('says when nobody matches, and forgets the chosen person once the name changes', async () => {
      api.getUsers.mockResolvedValue(list([person('abcdefgh-1')]) as never);
      show();
      await openAssignments();
      await screen.findByText('No experiments');
      fireEvent.click(
        screen.getAllByRole('button', { name: 'Assign Experiment' })[0],
      );

      const form = detail();
      const who = within(form).getByPlaceholderText(
        'Search user by name or email...',
      );
      fireEvent.change(who, { target: { value: 'per' } });
      fireEvent.click(
        await within(form).findByRole('button', {
          name: /@person_abcdefgh-1/,
        }),
      );
      fireEvent.change(within(form).getByLabelText('Experiment Key'), {
        target: { value: 'beta_feature' },
      });
      expect(within(form).getByRole('button', { name: 'Save' })).toBeEnabled();

      api.getUsers.mockResolvedValue(list([]) as never);
      fireEvent.change(who, { target: { value: 'nobody' } });
      expect(
        await within(form).findByText('No users found.'),
      ).toBeInTheDocument();
      expect(within(form).getByRole('button', { name: 'Save' })).toBeDisabled();

      // A press outside the list of people closes it.
      fireEvent.mouseDown(document.body);
      expect(
        within(form).queryByText('No users found.'),
      ).not.toBeInTheDocument();
      fireEvent.focus(who);
      expect(
        await within(form).findByText('No users found.'),
      ).toBeInTheDocument();
    });

    it('changes only the variant of an existing assignment', async () => {
      api.getUserExperiments.mockResolvedValue(list([entry('1')]) as never);
      show();
      await openAssignments();
      fireEvent.click(await waitFor(() => rowOf('@person_1')));

      const form = detail();
      expect(
        within(form).getByRole('heading', { name: 'Edit Experiment' }),
      ).toBeInTheDocument();
      expect(within(form).getByLabelText('Experiment Key')).toBeDisabled();
      expect(within(form).getByDisplayValue('user-1')).toBeDisabled();
      fireEvent.change(within(form).getByLabelText('Variant'), {
        target: { value: 'false' },
      });
      fireEvent.click(within(form).getByRole('button', { name: 'Save' }));

      await waitFor(() =>
        expect(api.assignUserExperiment).toHaveBeenCalledWith(
          'user-1',
          'experiment_1',
          'false',
        ),
      );
    });

    it('removes an assignment after confirming, and closes it if it was open', async () => {
      api.getUserExperiments.mockResolvedValue(list([entry('1')]) as never);
      show();
      await openAssignments();
      const row = await waitFor(() => rowOf('@person_1'));
      fireEvent.click(row);
      expect(
        within(detail()).getByRole('heading', { name: 'Edit Experiment' }),
      ).toBeInTheDocument();

      fireEvent.click(
        within(row).getByRole('button', { name: 'More actions' }),
      );
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
      expect(
        within(dialog()).getByText(
          'Are you sure you want to remove this user experiment?',
        ),
      ).toBeInTheDocument();
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }));

      await waitFor(() =>
        expect(api.removeUserExperiment).toHaveBeenCalledWith('1'),
      );
      await waitFor(() =>
        expect(
          within(detail()).queryByRole('heading', { name: 'Edit Experiment' }),
        ).not.toBeInTheDocument(),
      );
      expect(toast.success).toHaveBeenCalledWith('Assignment removed');
    });

    it('says so when an assignment could not be saved or removed', async () => {
      api.getUserExperiments.mockResolvedValue(list([entry('1')]) as never);
      api.assignUserExperiment.mockRejectedValue(new Error('no'));
      api.removeUserExperiment.mockRejectedValue(new Error('no'));
      show();
      await openAssignments();
      const row = await waitFor(() => rowOf('@person_1'));
      fireEvent.click(row);
      fireEvent.click(within(detail()).getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'The assignment could not be saved',
        ),
      );
      // The form stays open to try again.
      expect(
        within(detail()).getByRole('heading', { name: 'Edit Experiment' }),
      ).toBeInTheDocument();

      fireEvent.click(
        within(row).getByRole('button', { name: 'More actions' }),
      );
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'The assignment could not be removed',
        ),
      );
    });
  });
});
