/** Route for opening a post; Frames use the immersive viewer, not post detail. */
export function getPostPath(post: { id: string; type?: string }): string {
  return post.type === 'FRAME' ? `/frames?post=${post.id}` : `/p/${post.id}`;
}
