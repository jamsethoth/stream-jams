# Tasks

## 1. Core

- [x] 1.1 Add optional `layout.shadow` to the Videos layout type, strict schema and plain validator; carry it to the browser projection.
- [x] 1.2 Size the Videos browser canvas and origin from the shared shadow margin; layouts without a shadow keep zero margin.

## 2. Web

- [x] 2.1 Draw the saved shadow on the picture in the browser source, the desktop overlay and the editor preview.
- [x] 2.2 Add a collapsed Shadow section to the Videos placement editor; Reset content and placement keeps the shadow.

## 3. Caption

- [x] 3.1 Project the provider title (else the submitted title) and the channel; show "channel · Requested by requester".
- [x] 3.2 Add optional `layout.captionFont` and a Caption font select.

## 4. Verification

- [x] 4.1 Core tests for validation, projection and canvas margin; overlay and editor unit tests; Storybook story.
- [x] 4.2 Playwright: a saved shadow widens the live browser source and moves the box past the margin.
- [ ] 4.3 Maintainer checks the Videos shadow, caption title, channel and font in OBS and on the Windows desktop overlay.
