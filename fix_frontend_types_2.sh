#!/bin/bash
cd circlesfera-frontend/src

sed -i '' 's/src={post.user.profile?.thumbnailUrl}/src={post.user.profile?.thumbnailUrl || undefined}/g' components/chat/SharedPost.tsx
sed -i '' 's/src={post.user.profile?.thumbnailUrl}/src={post.user.profile?.thumbnailUrl || undefined}/g' components/post/PostHeader.tsx
sed -i '' 's/src={group.user.profile?.thumbnailUrl}/src={group.user.profile?.thumbnailUrl || undefined}/g' components/StoryList.tsx

# In FrameItem.tsx 263
sed -i '' 's/post.user.profile?.thumbnailUrl,/post.user.profile?.thumbnailUrl || undefined,/g' components/FrameItem.tsx
# In FrameItem.tsx 316
sed -i '' 's/standardUrl: post.audio.coverUrl,/standardUrl: post.audio.coverUrl || undefined,/g' components/FrameItem.tsx

# In PostMedia.tsx 62
sed -i '' 's/standardUrl: media.standardUrl,/standardUrl: media.standardUrl || undefined,/g' components/post/PostMedia.tsx
