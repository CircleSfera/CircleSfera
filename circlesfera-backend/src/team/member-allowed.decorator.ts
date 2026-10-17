import { SetMetadata } from '@nestjs/common';
import type { ProfileAction } from './profile-actions.js';

export const MEMBER_ALLOWED = 'team:memberAllowed';

// What opens a route to a session acting as a Profile the person works on as
// a team member (ADR-0028):
// - 'session': keeping and leaving the session (any role);
// - 'browse': reading what anyone signed in may read (any role);
// - an action of the role table: only roles that allow it.
// A route without it is closed to member sessions.
export type MemberAccess = 'session' | 'browse' | ProfileAction;

export const MemberAllowed = (access: MemberAccess) =>
  SetMetadata(MEMBER_ALLOWED, access);
