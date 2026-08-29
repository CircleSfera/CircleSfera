import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { authApi, profileApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import { Button } from '../ui';

/** Persistent banner until the signed-in user verifies email. */
export default function EmailVerificationBanner() {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['myProfile'],
    queryFn: () => profileApi.getMyProfile(),
    enabled: isAuthenticated,
  });

  const profile = data?.data as
    | {
        emailConfirmed?: boolean;
        emailVerified?: string | null;
        user?: { emailVerified?: string | null };
      }
    | undefined;

  const confirmed =
    profile?.emailConfirmed === true ||
    !!profile?.emailVerified ||
    !!profile?.user?.emailVerified;

  const resend = useMutation({
    mutationFn: () => authApi.resendVerification(),
    onSuccess: () => {
      toast.success(
        t('auth.verify.resend_success', 'Verification email sent.'),
      );
      queryClient.invalidateQueries({ queryKey: ['myProfile'] });
    },
    onError: () => {
      toast.error(t('auth.verify.resend_error', 'Could not resend email.'));
    },
  });

  if (!isAuthenticated || !profile || confirmed) return null;

  return (
    <>
      {/* Reserve space on mobile (TopNav is fixed above this bar). */}
      <div className="md:hidden h-10 shrink-0" aria-hidden />
      <div
        className="fixed inset-x-0 z-[45] top-[calc(var(--nav-top-height,52px)+env(safe-area-inset-top,0px))] border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5 backdrop-blur-md md:static md:sticky md:top-0 md:z-40"
        role="status"
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3 text-sm">
          <Mail className="size-4 shrink-0 text-amber-400" aria-hidden />
          <p className="flex-1 text-amber-100/90 text-xs md:text-sm">
            {t(
              'auth.verify.banner',
              'Confirm your email to post, follow, message, and like.',
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            isLoading={resend.isPending}
            onClick={() => resend.mutate()}
            className="shrink-0 h-9 text-xs uppercase font-bold"
          >
            {t('auth.verify.resend', 'Resend')}
          </Button>
        </div>
      </div>
    </>
  );
}
