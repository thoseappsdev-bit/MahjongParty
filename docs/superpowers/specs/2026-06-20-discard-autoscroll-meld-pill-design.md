# Discard Auto-scroll and Meld Pill Design

## Goal

Keep the newest discarded tiles visible when the shared center discard grid overflows, and ensure meld labels such as `CHOW S4 S5 S6` have a background pill wide enough for the complete label.

## Behavior

- The discard viewport follows the bottom of its content whenever the total discard count increases.
- Players can still use wheel or touch scrolling to inspect earlier discarded tiles between turns.
- A subsequent discard resumes following the newest tile.
- Meld badge width is derived from the rendered label length, with consistent horizontal padding and a board-safe maximum width.
- Short meld labels retain the current compact appearance.

## Implementation Shape

- Keep scroll state and discard-count change detection in `PixiMatchBoard`.
- Keep deterministic badge sizing in the Pixi layout helper so it can be unit tested independently of canvas rendering.
- Reuse the existing discard mask, scrollbar, and Pixi badge drawing path.

## Verification

- Unit test that increasing an overflowing discard count selects the maximum scroll offset.
- Unit test that a `CHOW S4 S5 S6` badge is wider than a short meld and contains the required padding.
- Run the focused web tests and production build.
- Verify the rendered desktop board at an overflowing discard state, including console health and screenshot evidence.
