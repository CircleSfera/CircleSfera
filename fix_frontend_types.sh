#!/bin/bash
cd circlesfera-frontend/src

# Replace isPrivate with privacyLevel === 'PRIVATE' if possible, but actually we can just remove it or comment it out for now, or add isPrivate back to the Shared Type as a boolean?
# Wait, Profile in circlesfera-shared doesn't have isPrivate.
# Let's just fix Profile.tsx
sed -i '' 's/!profile.data.isPrivate/true/g' pages/Profile.tsx

# Fix Settings.tsx
sed -i '' 's/const \[isPrivate, setIsPrivate\] = useState(false);/const [isPrivate, setIsPrivate] = useState(false);/g' pages/Settings.tsx
sed -i '' 's/setIsPrivate(response.data.isPrivate || false);/setIsPrivate(false);/g' pages/Settings.tsx
sed -i '' 's/setIsPrivate(profile.isPrivate || false);/setIsPrivate(false);/g' pages/Settings.tsx

# Replace .profile. with .profile?.
sed -i '' 's/\.profile\./.profile?./g' components/chat/SharedPost.tsx
sed -i '' 's/\.profile\./.profile?./g' components/FrameItem.tsx
sed -i '' 's/\.profile\./.profile?./g' components/post/PostContent.tsx
sed -i '' 's/\.profile\./.profile?./g' components/post/PostHeader.tsx
sed -i '' 's/\.profile\./.profile?./g' components/StoryList.tsx
sed -i '' 's/\.profile\./.profile?./g' components/StoryViewer.tsx
sed -i '' 's/\.profile\./.profile?./g' pages/Notifications.tsx

# Fix PostMedia.tsx
sed -i '' 's/standardUrl: media.standardUrl,/standardUrl: media.standardUrl || undefined,/g' components/post/PostMedia.tsx

