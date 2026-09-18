# Media-synchronized duration and audio fades verification

## Behavior

- New Alerts and Screen Effect variants use media-linked duration; existing saved content without a mode remains Custom.
- Alert duration uses visible local audio/video layers with a 5-second fallback. Screen Effects use video and separate sound with a 10-second fallback. Both cap at 120 seconds.
- Stored asset metadata is authoritative at playback admission. A bounded repair action probes legacy timed media with missing duration.
- Each local audio source has independent fade-in and fade-out settings. Browser overlays, local previews and named-device playback calculate the same linear absolute-time envelope. Overlapping fades are proportionally shortened.
- Replays retain the admitted duration and source lengths. TTS remains outside the fade model.

## UX review

- Applicable UX areas: focused Alert editor, Screen Effect hierarchy/editor, asset metadata, explicit save behavior and local preview.
- Failure and empty states explain the fallback and offer **Retry duration** when a timed asset has no readable metadata.
- Controls use labeled radio buttons, checkboxes and numeric inputs with standard keyboard behavior. The existing editors retain Undo, Redo, Revert and Save semantics.
- Storybook includes the media-linked duration and enabled-fades state. Focused Testing Library coverage exercises duration selection, repair and fade defaults.

## Automated evidence

Record final command results here after the complete verification pass.
