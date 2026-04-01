# Feature: Admin Panel (CircleSfera)

The Admin Panel is the centralized command center for managing the CircleSfera platform.

## 1. Overview
- **Path**: `/admin` (Restricted to ADMIN role).
- **Tech**: React components with `AdminSidebar` and `AdminTable`.

## 2. Main Functionalities

### 🛡️ User Management (`UsersTab`)
- View all registered users.
- Manage **Verification Levels** (Standard, Verified, Business, Elite).
- Update account types.

### 📝 Content Moderation (`PostsTab`, `StoriesTab`, `CommentsTab`)
- Monitor all user-generated content.
- Delete inappropriate content or resolve reports.

### 🚩 Reports Management (`ReportsTab`)
- View and resolve user-submitted reports for posts and accounts.

### 📊 Platform Statistics (`StatsTab`)
- High-level overview of user growth, active posts, and engagement.

## 3. Responsive Architecture
The Admin Panel is fully responsive:
- **Mobile (< 1024px)**: Uses a horizontal scrollable menu for navigation and horizontal scrollable tables for data.
- **Desktop (>= 1024px)**: Uses a vertical sidebar and full grid layout.
- **Tables**: All tables use a unified structure that supports horizontal scrolling on small screens to maintain data column integrity.
