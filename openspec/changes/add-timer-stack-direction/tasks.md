# Tasks

## 1. Core

- [x] 1.1 Add optional `appearance.reverse` and `desktopPlacement.reverse` to the Timer types and strict schemas.
- [x] 1.2 Mirror slots and the overflow badge inside the reserved footprint for reversed browser and desktop geometry.

## 2. Management

- [x] 2.1 Replace Orientation with a four-way Stack direction select.
- [x] 2.2 Add a Desktop direction select that defaults to following the browser source.

## 3. Verification

- [x] 3.1 Core geometry tests: both orientations, unchanged footprint, badge before every card, desktop override, invalid values rejected.
- [x] 3.2 Editor unit test and Storybook stories for Bottom to top and Right to left.
- [x] 3.3 Playwright: saving Bottom to top reverses the live browser source while a desktop override keeps the desktop top to bottom.
- [ ] 3.4 Maintainer checks a bottom-to-top stack in OBS and on the Windows desktop overlay.
