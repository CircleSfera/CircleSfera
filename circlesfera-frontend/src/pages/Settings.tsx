import { Navigate, useParams } from 'react-router-dom';
import AccountSettings from '../components/settings/AccountSettings';
import AppealsSettings from '../components/settings/AppealsSettings';
import BillingSettings from '../components/settings/BillingSettings';
import CloseFriendsSettings from '../components/settings/CloseFriendsSettings';
import FeedPreferencesSettings from '../components/settings/FeedPreferencesSettings';
import { MonetizationSettings } from '../components/settings/MonetizationSettings';
import MutesSettings from '../components/settings/MutesSettings';
import MyReportsSettings from '../components/settings/MyReportsSettings';
import NotificationsSettings from '../components/settings/NotificationsSettings';
import PrivacySettings from '../components/settings/PrivacySettings';
import ProfileSettings from '../components/settings/ProfileSettings';
import ReferralsSettings from '../components/settings/ReferralsSettings';
import RequestsSettings from '../components/settings/RequestsSettings';
import SecuritySettings from '../components/settings/SecuritySettings';
import SettingsHubIndex from '../components/settings/SettingsHubIndex';
import SettingsShell from '../components/settings/SettingsShell';
import {
  isSettingsSectionId,
  type SettingsSectionId,
} from '../components/settings/settingsNav';

function SectionPanel({ section }: { section: SettingsSectionId }) {
  switch (section) {
    case 'profile':
      return <ProfileSettings />;
    case 'privacy':
      return <PrivacySettings />;
    case 'notifications':
      return <NotificationsSettings />;
    case 'security':
      return <SecuritySettings />;
    case 'billing':
      return <BillingSettings />;
    case 'monetization':
      return <MonetizationSettings />;
    case 'requests':
      return <RequestsSettings />;
    case 'referrals':
      return <ReferralsSettings />;
    case 'close_friends':
      return <CloseFriendsSettings />;
    case 'mutes':
      return <MutesSettings />;
    case 'feed_prefs':
      return <FeedPreferencesSettings />;
    case 'appeals':
      return <AppealsSettings />;
    case 'reports':
      return <MyReportsSettings />;
    case 'account':
      return <AccountSettings />;
    default:
      return <SettingsHubIndex />;
  }
}

/**
 * Account hub — index at /accounts, sections at /accounts/:section.
 */
export default function Settings() {
  const { section } = useParams<{ section?: string }>();

  if (section && !isSettingsSectionId(section)) {
    return <Navigate to="/accounts" replace />;
  }

  const activeSection = isSettingsSectionId(section) ? section : null;

  return (
    <SettingsShell section={activeSection}>
      {activeSection ? (
        <SectionPanel section={activeSection} />
      ) : (
        <SettingsHubIndex />
      )}
    </SettingsShell>
  );
}
