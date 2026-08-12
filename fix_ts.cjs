const fs = require('node:fs');
const path = require('node:path');

const srcDir = path.join(__dirname, 'circlesfera-frontend', 'src');

function fixFile(filePath, replacements) {
  const fullPath = path.join(srcDir, filePath);
  let content = fs.readFileSync(fullPath, 'utf8');
  for (const [from, to] of replacements) {
    content = content.split(from).join(to);
  }
  fs.writeFileSync(fullPath, content);
}

// 1. SharedPost.tsx
fixFile('components/chat/SharedPost.tsx', [
  [
    'post.user.profile?.username || undefined',
    "post.user.profile?.username || ''",
  ],
  [
    'alt={post.user.profile?.username}',
    "alt={post.user.profile?.username || ''}",
  ],
]);

// 2. FrameItem.tsx
fixFile('components/FrameItem.tsx', [
  [
    'followsApi.toggle(post.user.profile?.username)',
    "followsApi.toggle(post.user.profile?.username || '')",
  ],
  [
    'hlsUrl={videoMedia.standardUrl}',
    'hlsUrl={videoMedia.standardUrl || undefined}',
  ],
]);

// 3. PostHeader.tsx
fixFile('components/post/PostHeader.tsx', [
  [
    'alt={post.user.profile?.username}',
    "alt={post.user.profile?.username || ''}",
  ],
]);

// 4. PostMedia.tsx
fixFile('components/post/PostMedia.tsx', [
  [
    'standardUrl: media.standardUrl,',
    'standardUrl: media.standardUrl || undefined,',
  ],
]);

// 5. StoryList.tsx
fixFile('components/StoryList.tsx', [
  [
    'alt={group.user.profile?.username}',
    "alt={group.user.profile?.username || ''}",
  ],
]);
