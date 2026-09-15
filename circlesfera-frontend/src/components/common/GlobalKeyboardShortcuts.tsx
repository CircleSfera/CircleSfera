import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

export function GlobalKeyboardShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

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
      description: t('shortcuts.next_post'),
      handler: () => {
        const posts = getVisiblePosts();
        const activeIndex = getActivePostIndex(posts);
        scrollToPost(activeIndex + 1, posts);
      },
    },
    {
      key: 'k',
      description: t('shortcuts.previous_post'),
      handler: () => {
        const posts = getVisiblePosts();
        const activeIndex = getActivePostIndex(posts);
        scrollToPost(activeIndex - 1, posts);
      },
    },
    {
      key: 'l',
      description: t('shortcuts.like_post'),
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
      description: t('shortcuts.search'),
      handler: (e) => {
        e.preventDefault();
        if (location.pathname !== '/explore') {
          navigate('/explore');
        } else {
          const searchInput = document.querySelector(
            '[data-testid="explore-search-input"]',
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
