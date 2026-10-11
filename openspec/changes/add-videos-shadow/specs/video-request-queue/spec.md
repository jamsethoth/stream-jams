## ADDED Requirements

### Requirement: Videos Picture Shadow Is Configurable
The Videos layout SHALL offer an optional picture shadow with the shared box-shadow fields: X and Y offset, blur, spread and RGBA color. The browser source, the desktop overlay and the management preview SHALL draw the same saved shadow on the picture.

When a shadow is saved, the browser content canvas SHALL add the shared shadow margin on each side and place the content box past it. A fully transparent shadow SHALL add no margin, so the content box sits at the source's top-left corner. The desktop scene canvas and desktop placement SHALL NOT change with the shadow. Layouts saved without a shadow SHALL keep the original picture shadow and the existing browser canvas size.

#### Scenario: Shadow is not clipped in OBS
- **WHEN** the operator saves a 640 x 460 box with a shadow whose margin is 16 px on each side
- **THEN** the browser source canvas becomes 672 x 492 and the box starts 16 px from its top-left corner

#### Scenario: Shadow off
- **WHEN** the operator turns the shadow off and saves
- **THEN** the browser canvas matches the content size and the box sits exactly at the source edge

#### Scenario: Older layout
- **WHEN** a saved Videos layout has no shadow
- **THEN** the picture keeps the original shadow and the browser canvas keeps the content size
