/**
 * Design-system barrel export for avatars.
 * Product code should prefer `UserAvatar` (stories, online, verification).
 * This re-exports it so `import { Avatar } from '@/components/ui'` stays valid.
 */
export { default as Avatar } from '../UserAvatar';
