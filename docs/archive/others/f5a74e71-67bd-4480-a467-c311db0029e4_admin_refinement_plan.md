# Admin Panel Sidebar Refinement

Resolving duplicate menu items and improving the visibility of the system status in the administration dashboard.

## Proposed Changes

### 1. Sidebar Clean-up & Reorganization

#### [MODIFY] [AdminSidebar.tsx](file:///Users/ShadyFeliu/Desktop/Projects/CircleSfera/circlesfera-frontend/src/components/admin/AdminSidebar.tsx)
- Reorganize `GROUPS` to eliminate duplicates:
    - **Dashboard**: Added `analytics` (missing), keep `monetization` and `verification`.
    - **Moderación**: Merge `users`, `posts`, `stories`, and `comments` here.
    - **Contenido**: Keep `hashtags`, `music`, and `whitelist`.
    - **Sistema**: Keep `reports` and `audit`.
- **Status Visibility**: Ensure the "Status" section is pinned to the bottom of the sidebar by using a stronger flexbox structure or ensuring the middle section handles overflow correctly.
- **Icons**: Update icons for consistency (e.g., using `LayoutDashboard` for Analytics).

## Verification Plan

### Manual Verification
1. Access `/admin` and verify that "Usuarios", "Publicaciones", and "Historias" only appear once in the sidebar.
2. Confirm the "Analytics" (Estadísticas) tab is now visible and selectable in the "Dashboard" group.
3. Test sidebar scrolling on a laptop screen (smaller height) to ensure the "Status: Sistema Online" box remains always visible at the bottom while the menu items scroll above it.
