import { useLocation, useNavigate } from 'react-router-dom';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

export function GlobalKeyboardShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();

  const getVisiblePosts = () => {
    return Array.from(
      document.querySelectorAll('[data-post-card="true"]'),
    ) as HTMLElement[];
  };

  const getActivePostIndex = (posts: HTMLElement[]) => {
    const viewportMiddle = window.innerHeight / 2;
    let closestIndex = -1;
    let closestDistance = Infinity;

    posts.forEach((post, index) => {
      const rect = post.getBoundingClientRect();
      const postMiddle = rect.top + rect.height / 2;
      const distance = Math.abs(viewportMiddle - postMiddle);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    return closestIndex;
  };

  const scrollToPost = (index: number, posts: HTMLElement[]) => {
    if (index >= 0 && index < posts.length) {
      const post = posts[index];
      const offset = 80; // Offset for top nav
      const top = post.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  useKeyboardShortcuts([
    {
      key: 'j',
      description: 'Next post',
      handler: () => {
        const posts = getVisiblePosts();
        const activeIndex = getActivePostIndex(posts);
        scrollToPost(activeIndex + 1, posts);
      },
    },
    {
      key: 'k',
      description: 'Previous post',
      handler: () => {
        const posts = getVisiblePosts();
        const activeIndex = getActivePostIndex(posts);
        scrollToPost(activeIndex - 1, posts);
      },
    },
    {
      key: 'l',
      description: 'Like post',
      handler: () => {
        const posts = getVisiblePosts();
        const activeIndex = getActivePostIndex(posts);
        if (activeIndex !== -1) {
          const activePost = posts[activeIndex];
          const likeBtn = activePost.querySelector(
            '[data-testid="like-button"]',
          ) as HTMLButtonElement | null;
          if (likeBtn) {
            likeBtn.click();
          }
        }
      },
    },
    {
      key: '/',
      description: 'Search',
      handler: (e) => {
        e.preventDefault();
        if (location.pathname !== '/explore') {
          navigate('/explore');
        } else {
          const searchInput = document.querySelector(
            'input[placeholder*="Search"]',
          ) as HTMLInputElement | null;
          if (searchInput) {
            searchInput.focus();
          }
        }
      },
    },
  ]);

  return null;
}
