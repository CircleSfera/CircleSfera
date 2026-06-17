# CircleSfera Frontend

A modern, responsive social media web application built with React, TypeScript, and Tailwind CSS.

## 📋 Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Features](#features)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Components](#components)
- [State Management](#state-management)
- [API Integration](#api-integration)
- [Styling](#styling)
- [Best Practices](#best-practices)
- [Backlog](#backlog)

## 🎯 Overview

CircleSfera Frontend is a single-page application that provides a beautiful and intuitive user interface for social media interactions. Built with modern React patterns and TypeScript for type safety, it offers a seamless user experience.

## 🛠 Technology Stack

| Category             | Technology     | Version |
| -------------------- | -------------- | ------- |
| **Framework**        | React          | 19.2.3  |
| **Build Tool**       | Vite           | 7.2.4   |
| **Language**         | TypeScript     | 5.9.3   |
| **Styling**          | Tailwind CSS   | 4.1.18  |
| **Routing**          | React Router   | 7.13.0  |
| **State Management** | Zustand        | 5.0.11  |
| **Data Fetching**    | TanStack Query | 5.90.20 |
| **HTTP Client**      | Axios          | 1.13.4  |

## ✨ Features

### Authentication

- [x] User registration with form validation
- [x] Secure login with JWT tokens
- [x] Automatic token refresh
- [x] Protected routes
- [x] Persistent auth state

### User Experience

- [x] Responsive design (mobile-first)
- [x] Modern UI with gradients and animations
- [x] Loading states and skeletons
- [x] Error handling with user-friendly messages
- [x] Empty state handling

### Social Features

- [x] Personalized home feed
- [x] Explore page with all posts
- [x] User profiles with stats
- [x] Follow/Unfollow users
- [x] Like/Unlike posts
- [x] Comments section
- [x] 24-hour stories viewer

### Navigation

- [x] Fixed navbar with branding
- [x] Quick access to profile
- [x] Settings page
- [x] Logout functionality

## 📁 Project Structure

```
frontend-app/
├── public/                   # Static assets
├── src/
│   ├── components/           # Reusable UI components
│   │   ├── CommentList.tsx   # Comments display and input
│   │   ├── ErrorEmptyStates.tsx  # Error and empty states
│   │   ├── FollowButton.tsx  # Follow/unfollow button
│   │   ├── LikeButton.tsx    # Like/unlike button
│   │   ├── LoadingStates.tsx # Loading spinners and skeletons
│   │   ├── Navbar.tsx        # Top navigation bar
│   │   ├── PostCard.tsx      # Post display card
│   │   ├── Sidebar.tsx       # Side navigation
│   │   ├── StoryList.tsx     # Stories horizontal list
│   │   ├── StoryViewer.tsx   # Full-screen story viewer
│   │   ├── UserAvatar.tsx    # User avatar component
│   │   └── index.ts          # Component exports
│   ├── pages/                # Page components
│   │   ├── Explore.tsx       # Explore/discover page
│   │   ├── Home.tsx          # Main feed page
│   │   ├── Login.tsx         # Login page
│   │   ├── PostDetail.tsx    # Single post view
│   │   ├── Profile.tsx       # User profile page
│   │   ├── Register.tsx      # Registration page
│   │   └── Settings.tsx      # User settings page
│   ├── services/             # API integration
│   │   ├── api.ts            # Axios instance and interceptors
│   │   └── index.ts          # API endpoint functions
│   ├── stores/               # State management
│   │   └── authStore.ts      # Authentication state (Zustand)
│   ├── types/                # TypeScript type definitions
│   │   └── index.ts          # Shared types
│   ├── App.tsx               # Root component with routing
│   ├── main.tsx              # Application entry point
│   └── index.css             # Global styles (Tailwind)
├── .env.example              # Environment variables template
├── index.html                # HTML template
├── package.json              # Dependencies and scripts
├── tailwind.config.js        # Tailwind configuration
├── tsconfig.json             # TypeScript configuration
└── vite.config.ts            # Vite configuration
```

## 🚀 Getting Started

### Prerequisites

- Node.js 20.x or higher
- npm or yarn
- Backend API running (see backend README)
- **Shared Package**: Must be built locally (see Root README)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd frontend-app

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
```

### Environment Variables

```env
# API URL
VITE_API_URL=http://localhost:3000
```

### Running the Application

```bash
# Development server
npm run dev

# Production build
npm run build

# Preview production build
npm run preview

# Run linting
npm run lint
```

## 🧩 Components

### Core Components

| Component    | Description                                     |
| ------------ | ----------------------------------------------- |
| `Navbar`     | Top navigation with logo, nav icons, and logout |
| `Sidebar`    | Side navigation for desktop views               |
| `PostCard`   | Displays a single post with interactions        |
| `UserAvatar` | Reusable avatar component with fallback         |

### Interactive Components

| Component      | Description                             |
| -------------- | --------------------------------------- |
| `LikeButton`   | Heart icon that toggles like state      |
| `FollowButton` | Button to follow/unfollow users         |
| `CommentList`  | Displays comments with add comment form |

### Story Components

| Component     | Description                            |
| ------------- | -------------------------------------- |
| `StoryList`   | Horizontal scrollable story circles    |
| `StoryViewer` | Full-screen story viewer with progress |

### State Components

| Component        | Description                     |
| ---------------- | ------------------------------- |
| `LoadingSpinner` | Animated loading spinner        |
| `LoadingCard`    | Skeleton loader for cards       |
| `LoadingPage`    | Full-page loading state         |
| `ErrorState`     | Error message with retry option |
| `EmptyState`     | Empty content placeholder       |

## 🗃 State Management

### Zustand Store (authStore)

```typescript
interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  profile: UserProfile | null;
  isAuthenticated: boolean;

  // Actions
  setTokens: (access: string, refresh: string) => void;
  setProfile: (profile: UserProfile) => void;
  logout: () => void;
}
```

**Features:**

- Persistent storage (localStorage)
- Type-safe with TypeScript
- Simple API for authentication state

### TanStack Query

Used for:

- Server state management
- Automatic caching
- Background refetching
- Optimistic updates
- Query invalidation

**Query Keys Convention:**

```typescript
["feed"]["explore"][("post", id)][("profile", username)][("comments", postId)][ // Home feed // Explore posts // Single post // User profile // Post comments
  ("followers", username)
][("following", username)]; // User followers // User following
```

## 🔌 API Integration

### Axios Instance (`services/api.ts`)

```typescript
// Automatic token injection
requestInterceptor: (config) => {
  const token = authStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
};

// Automatic token refresh on 401
responseInterceptor: async (error) => {
  if (error.response?.status === 401) {
    // Attempt token refresh
  }
};
```

### API Modules

| Module             | Endpoints                                            |
| ------------------ | ---------------------------------------------------- |
| `authApi`          | register, login, refresh, logout                     |
| `postsApi`         | create, getFeed, getExplore, getById, update, delete |
| `profileApi`       | getProfile, getMyProfile, update                     |
| `followsApi`       | toggle, check, getFollowers, getFollowing            |
| `likesApi`         | toggle, check                                        |
| `commentsApi`      | getByPost, create, delete                            |
| `storiesApi`       | create, getAll, getByUser                            |
| `notificationsApi` | getAll, getUnreadCount, markAsRead                   |

## 🎨 Styling

### Tailwind CSS v4

**Configuration:**

- PostCSS with `@tailwindcss/postcss`
- Custom color scheme (purple/pink gradients)
- Responsive breakpoints
- Dark mode ready

**Design System:**

```css
/* Brand Colors */
--purple-600: Primary brand color --pink-600: Accent color /* Gradients */
  bg-gradient-to-r from-purple-600 to-pink-600 /* Shadows */ shadow: Card
  elevation shadow-lg: Modal/overlay elevation /* Transitions */
  transition: Default transitions for hover states;
```

### Component Styling Patterns

```tsx
// Example: Button with hover state
<button
  className="
  bg-purple-600 
  text-white 
  px-4 py-2 
  rounded-lg 
  hover:bg-purple-700 
  transition
"
>
  Button
</button>
```

## 📐 Best Practices

### TypeScript

- **Strict Mode**: Enabled for maximum type safety
- **Type-only Imports**: Using `import type` where applicable
- **Interface Definitions**: All API responses typed
- **Generic Components**: Reusable typed components

### React Patterns

- **Functional Components**: All components are functional
- **Custom Hooks**: TanStack Query for data fetching
- **Composition**: Small, composable components
- **Prop Drilling Avoidance**: Zustand for global state

### Performance

- **Code Splitting**: React Router lazy loading ready
- **Query Caching**: TanStack Query caches responses
- **Optimistic Updates**: Instant UI feedback
- **Image Optimization**: Lazy loading for images

### Code Organization

- **Barrel Exports**: `index.ts` for clean imports
- **Feature-based Structure**: Components grouped by feature
- **Type Colocation**: Types near their usage
- **Consistent Naming**: PascalCase for components

### Security

- **No Sensitive Data in Code**: Environment variables
- **Token Management**: Secure storage and refresh
- **Protected Routes**: Auth-guarded pages
- **XSS Prevention**: React's built-in escaping

## 📋 Backlog

### Completed ✅

- [x] Authentication system (login/register)
- [x] Home feed with followed users' posts
- [x] Explore page with all posts
- [x] User profiles with stats
- [x] Follow/Unfollow functionality
- [x] Like posts
- [x] Comments
- [x] 24-hour stories
- [x] Responsive design
- [x] Loading states
- [x] Error handling

### Future Enhancements 🚧

- [ ] Dark mode toggle
- [ ] Infinite scroll pagination
- [ ] Post creation form with image upload
- [ ] Story creation
- [ ] Direct messaging UI
- [ ] Notifications page
- [ ] User search
- [ ] Hashtag pages
- [ ] Post sharing
- [ ] Profile editing UI
- [ ] PWA support
- [ ] Push notifications
- [ ] Accessibility improvements (ARIA)
- [ ] E2E tests with Playwright
- [ ] Unit tests with Vitest

## 🧪 Testing

### Available Scripts

```bash
# Run ESLint
npm run lint

# Type checking
npx tsc --noEmit
```

### Recommended Testing Setup (Future)

- **Unit Tests**: Vitest + React Testing Library
- **E2E Tests**: Playwright
- **Component Tests**: Storybook

## 📄 License

MIT License - See LICENSE file for details.

## 👥 Contributors

- Development Team

---

Built with ❤️ using React + Vite
