import { Navigate, useParams } from 'react-router-dom';
import AccountSettings from '../components/settings/AccountSettings';
import AdsSettings from '../components/settings/AdsSettings';
import AppealsSettings from '../components/settings/AppealsSettings';
import ArchiveSettings from '../components/settings/ArchiveSettings';
import BillingSettings from '../components/settings/BillingSettings';
import CloseFriendsSettings from '../components/settings/CloseFriendsSettings';
import CollaborationsSettings from '../components/settings/CollaborationsSettings';
import CompanySettings from '../components/settings/CompanySettings';
import FavoritesSettings from '../components/settings/FavoritesSettings';
import FeedPreferencesSettings from '../components/settings/FeedPreferencesSettings';
import HiddenWordsSettings from '../components/settings/HiddenWordsSettings';
import MutesSettings from '../components/settings/MutesSettings';
import MyReportsSettings from '../components/settings/MyReportsSettings';
import NotificationsSettings from '../components/settings/NotificationsSettings';
import PrivacySettings from '../components/settings/PrivacySettings';
import ProfileSettings from '../components/settings/ProfileSettings';
import ProfilesSettings from '../components/settings/ProfilesSettings';
import RecentlyDeletedSettings from '../components/settings/RecentlyDeletedSettings';
import RequestsSettings from '../components/settings/RequestsSettings';
import SecuritySettings from '../components/settings/SecuritySettings';
import SettingsHubIndex from '../components/settings/SettingsHubIndex';
import SettingsShell from '../components/settings/SettingsShell';
import {
  isSettingsSectionId,
  isSettingsSectionShown,
  type SettingsSectionId,
} from '../components/settings/settingsNav';
import TagsSettings from '../components/settings/TagsSettings';
import TeamSettings from '../components/settings/TeamSettings';
import { useExperimentStore } from '../stores/useExperimentStore';

function SectionPanel({ section }: { section: SettingsSectionId }) {
  switch (section) {
    case 'profile':
      return <ProfileSettings />;
    case 'profiles':
      return <ProfilesSettings />;
    case 'team':
      return <TeamSettings />;
    case 'company':
      return <CompanySettings />;
    case 'privacy':
      return <PrivacySettings />;
    case 'notifications':
      return <NotificationsSettings />;
    case 'security':
      return <SecuritySettings />;
    case 'billing':
      return <BillingSettings />;
    case 'requests':
      return <RequestsSettings />;
    case 'collaborations':
      return <CollaborationsSettings />;
    case 'close_friends':
      return <CloseFriendsSettings />;
    case 'favorites':
      return <FavoritesSettings />;
    case 'mutes':
      return <MutesSettings />;
    case 'tags':
      return <TagsSettings />;
    case 'hidden_words':
      return <HiddenWordsSettings />;
    case 'feed_prefs':
      return <FeedPreferencesSettings />;
    case 'ads':
      return <AdsSettings />;
    case 'appeals':
      return <AppealsSettings />;
    case 'reports':
      return <MyReportsSettings />;
    case 'recently_deleted':
      return <RecentlyDeletedSettings />;
    case 'archive':
      return <ArchiveSettings />;
    case 'account':
      return <AccountSettings />;
    default:
      return <SettingsHubIndex />;
  }
}

// Account hub — index at /accounts, sections at /accounts/:section.
export default function Settings() {
  const { section } = useParams<{ section?: string }>();
  const flags = useExperimentStore((state) => state.flags);
  const flagsLoaded = useExperimentStore((state) => state.isLoaded);

  if (section && !isSettingsSectionId(section)) {
    return <Navigate to="/accounts" replace />;
  }
  // A section behind a flag that is off is not there. Until the flags are
  // read, nothing is decided.
  if (isSettingsSectionId(section) && !isSettingsSectionShown(section, flags)) {
    return flagsLoaded ? <Navigate to="/accounts" replace /> : null;
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
