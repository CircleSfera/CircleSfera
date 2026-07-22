import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { profileApi } from '../../services';
import UserAvatar from '../UserAvatar';
import { Button, Input } from '../ui';

export default function ReferralsSettings() {
  const { data, isLoading } = useQuery({
    queryKey: ['myReferrals'],
    queryFn: () => profileApi.getMyReferrals(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-10">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  const inviteCode = data?.data?.inviteCode;
  const referrals = data?.data?.referrals || [];
  const maxReferrals = data?.data?.maxReferrals || 3;
  const referralCount = data?.data?.referralCount || 0;
  const inviteLink = `${window.location.origin}/accounts/emailsignup?inviteCode=${inviteCode}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    toast.success('Invite link copied!');
  };

  return (
    <div className="max-w-xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-xl font-black text-white tracking-tighter">
          Beta Invites
        </h2>
        <p className="text-gray-300 text-sm font-medium mt-1 uppercase tracking-wide italic opacity-60">
          Invite your friends to CircleSfera
        </p>
      </div>

      <div className="bg-white/2 p-5 rounded-xl border border-white/5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Your Invite Link
          </h3>
          <span className="text-xs font-bold bg-blue-500/20 text-blue-400 px-2 py-1 rounded-md">
            {referralCount} / {maxReferrals} Used
          </span>
        </div>

        <div className="flex gap-2 mb-2">
          <Input
            value={inviteLink}
            readOnly
            className="flex-1 font-mono text-sm"
          />
          <Button
            onClick={handleCopyLink}
            disabled={referralCount >= maxReferrals}
          >
            Copy
          </Button>
        </div>
        {referralCount >= maxReferrals && (
          <p className="text-xs text-red-400 font-bold uppercase tracking-wider">
            You have reached the maximum number of invites for this beta phase.
          </p>
        )}
      </div>

      <div className="bg-white/2 p-5 rounded-xl border border-white/5 space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Users you invited
        </h3>

        {referrals.length === 0 ? (
          <div className="text-center py-6 text-gray-500 text-sm font-medium">
            You haven't invited anyone yet.
          </div>
        ) : (
          <div className="space-y-3">
            {referrals.map((referral: any) => (
              <div
                key={referral.id}
                className="flex items-center gap-3 p-3 bg-white/5 rounded-lg"
              >
                <UserAvatar
                  src={referral.profile?.avatar}
                  alt={referral.profile?.fullName || referral.profile?.username}
                  size="md"
                />
                <div className="flex flex-col">
                  <span className="font-bold text-white text-sm">
                    {referral.profile?.fullName || referral.profile?.username}
                  </span>
                  <span className="text-xs text-gray-300">
                    @{referral.profile?.username} • Joined{' '}
                    {new Date(referral.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
