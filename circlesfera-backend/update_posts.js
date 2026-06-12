const fs = require('node:fs');
let code = fs.readFileSync('src/posts/posts.service.ts', 'utf8');

// Replace mapping block in findAll, findByUser, getFramesFeed
code = code.replace(
  /const formattedPosts = posts\.map\(\(post\) => \{\s+const \{ likes, \.\.\.rest \} = post;\s+return \{\s+\.\.\.rest,\s+isLiked: currentUserId \? \(likes as any\[\]\)\.length > 0 : false,\s+\};\s+\}\);/g,
  'const formattedPosts = await this.censorAndInjectPurchases(posts, currentUserId);',
);

// In getByTag, replace `return createPaginatedResult(posts, total, page, limit);`
// Wait, getFeed and getTaggedPosts also just return `posts`.
code = code.replace(
  /return createPaginatedResult\(posts, total, page, limit\);/g,
  'const formattedPosts = await this.censorAndInjectPurchases(posts, currentUserId || undefined);\n    return createPaginatedResult(formattedPosts, total, page, limit);',
);

// In getByTag signature, there's no currentUserId, so `currentUserId || undefined` will throw a ReferenceError if currentUserId is not defined.
