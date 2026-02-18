

# StroyAgent — UI Component Library & Design System

## Overview
Build a complete glassmorphism design system and reusable component library for StroyAgent, a full construction management platform (projects, estimates, procurement, documents, AI assistant). Backend will be added later — this phase is purely frontend UI kit.

## Phase 1: Design Tokens & Theme
- Define all CSS custom properties: color system (neutral base + construction green accent + amber warning + red danger), radii (16/20/24/999px), spacing (8pt grid), typography scale (H1 48–56, H2 28–32, body 15–16, caption 12–13)
- Implement light and dark theme with "Cloud Dancer" near-white breathing space
- Add subtle grain/noise overlay utility (2–4%)
- Set up modern grotesk font (Inter or similar)
- Create a **Theme Demo Page** showing all tokens visually

## Phase 2: GlassPanel & Surface Primitives
- **GlassPanel** component with variants: default, elevated, modal, sidebar
- Backdrop-blur 16–24px, background opacity 6–14%, inner highlight, 2-layer shadow system
- 1px hairline border with low-opacity edge highlight
- Optional header slot
- Consistent hover states (luminance lift + scale 1.01)

## Phase 3: Interactive Primitives
- **PrimaryButton / SecondaryButton / TertiaryButton / DangerButton**: rounded glass fill, hover glow, disabled/loading states
- **InputField**: glass-styled with icon slot, validation states (error/success/warning), helper text
- **TextArea** and **Select**: matching glass styling
- **Chip**: rounded pill (999px radius) with icon + text, for AI suggestions and filters
- **StatusBadge**: Draft/Approved/Archived, Not started/In progress/Done/Blocked, Not purchased/Purchased — each with semantic color

## Phase 4: Data Display Components
- **KPIWidget**: large number + delta indicator + sparkline placeholder
- **Table**: sticky header, zebra subtle rows, inline-edit cells, row actions menu, empty state illustration
- **EventFeedItem**: actor, verb, object, timestamp, icon by event type
- **PreviewCard**: diff-style proposed changes with counts + risk/warning slots (for AI preview)

## Phase 5: Overlay & Interaction Components
- **ConfirmModal**: glass modal with summary content + primary/secondary actions + optional tertiary action ("Create new version")
- **Toast system**: success/error/warning/info with glass styling
- **ActionBar**: Confirm/Cancel/New version row, pinned under AI preview
- **NotificationBell + Drawer**: unread badge, grouped notification items, deep links
- **UploadDropzone**: drag-drop area with file chips, progress indicator, warning note

## Phase 6: Component Showcase
- Build a **Component Gallery** page that displays every component with all variants and states
- This serves as a living style guide and validation that the system is cohesive
- Organized by category: surfaces, buttons, inputs, data display, overlays

All components will follow the design principles: neo-minimalism, liquid-glass aesthetic, cinematic but restrained motion (150–220ms micro, 280–420ms panels), CSS-only blur/gradients (no heavy WebGL), and strict accessibility contrast.

