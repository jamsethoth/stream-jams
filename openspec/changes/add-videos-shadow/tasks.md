# Tasks

## 1. Core

- [x] 1.1 Add optional `layout.shadow` to the Videos layout type, strict schema and plain validator; carry it to the browser projection.
- [x] 1.2 Size the Videos browser canvas and origin from the shared shadow margin; layouts without a shadow keep zero margin.

## 2. Web

- [x] 2.1 Draw the saved shadow on the picture in the browser source, the desktop overlay and the editor preview.
- [x] 2.2 Add a collapsed Shadow section to the Videos placement editor; Reset content and placement keeps the shadow.

## 3. Verification

- [x] 3.1 Core tests for validation, projection and canvas margin; overlay and editor unit tests; Storybook story.
- [x] 3.2 Playwright: a saved shadow widens the live browser source and moves the box past the margin.
- [ ] 3.3 Maintainer checks the Videos shadow in OBS and on the Windows desktop overlay.
