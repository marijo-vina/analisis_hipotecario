# Drawer Specification

## Purpose

Reusable drawer/sheet component that slides in from the right side of the viewport with overlay background. Used by ClientDrawer and CaseDetailDrawer for progressive disclosure of detail information.

## Requirements

### Requirement: Drawer Open/Close Behavior

The system MUST provide a drawer component that slides in from the right, displays an overlay behind it, and closes on three triggers: close button (X), Escape key, and overlay click.

#### Scenario: Drawer opens with slide animation

- GIVEN drawer component with `open={true}`
- WHEN rendered
- THEN drawer panel slides in from right edge with smooth transition (duration <= 300ms)
- AND overlay appears behind drawer with semi-transparent background

#### Scenario: Close via X button

- GIVEN drawer is open
- WHEN user clicks the X button in the drawer header
- THEN drawer slides out to the right and overlay disappears

#### Scenario: Close via Escape key

- GIVEN drawer is open and has focus
- WHEN user presses Escape key
- THEN drawer closes

#### Scenario: Close via overlay click

- GIVEN drawer is open
- WHEN user clicks on the overlay area outside the drawer panel
- THEN drawer closes

### Requirement: Drawer Content Slot

The system MUST accept arbitrary React children as drawer content. The drawer MUST NOT impose layout constraints on its children beyond a scrollable content area.

#### Scenario: Custom content renders

- GIVEN drawer receives a `<div>` with text "Hello" as children
- WHEN drawer is open
- THEN "Hello" is visible inside the drawer panel

### Requirement: Drawer Header

The system MUST render a fixed header bar at the top of the drawer containing a title and close button. The header MUST remain visible while content scrolls.

#### Scenario: Header stays fixed during scroll

- GIVEN drawer with content taller than viewport
- WHEN user scrolls content
- THEN header with title and X button remains visible at top

### Requirement: Mobile Fallback

The system MUST render the drawer as full-screen (100% width, 100% height) on viewports below 768px width.

#### Scenario: Full-screen on mobile

- GIVEN viewport width is 600px
- WHEN drawer opens
- THEN drawer covers entire viewport width and height

### Requirement: Focus Trap

The system MUST trap keyboard focus within the drawer while open. Tab navigation MUST cycle through focusable elements inside the drawer only.

#### Scenario: Focus stays in drawer

- GIVEN drawer is open with two buttons inside
- WHEN user presses Tab repeatedly
- THEN focus cycles between the two buttons and close button, never reaching elements outside the drawer
