# Interface and motion

YouBlock is a small utility: filtering status, the Hide/Blur choice, and adding rules are the popup's primary tasks. Settings support longer sessions of reviewing rules, changing preferences, and managing a local settings lock.

This refinement applied Emil Kowalski's [Design Engineering](https://github.com/emilkowalski/skills/blob/715c1807e08c497cfd1dc4feb450a2a3300ef2a9/skills/emil-design-eng/SKILL.md) and [Animate](https://github.com/emilkowalski/skills/blob/715c1807e08c497cfd1dc4feb450a2a3300ef2a9/skills/animate/SKILL.md) guidance, read from the official skills repository at revision `715c1807e08c497cfd1dc4feb450a2a3300ef2a9`. Skills were consulted for this change; no external skill code or runtime requests are shipped in the extension.

| Before | After | Purpose |
| --- | --- | --- |
| Two-line slogan in the popup | Compact heading, status surface, mode explanation | Keep space for useful controls |
| Rule editor stacked below the full popup | Focused editor with adjacent field/action controls | Keep the Save action visible at the native popup height |
| Small rule metadata, plain search field | Larger metadata, bordered search with visible focus | Make rule review and searching clearer |
| Full-page blur/fade on navigation | Instant page navigation and stable rule lists | Keep repeated tasks immediate |
| Shared-layout dot and animated page blur | CSS indicator, switch, editor and save feedback | Limit motion to meaningful state changes |

Settings retain the established lime accent, a forest primary action in light mode, and the system theme. The toolbar popup always uses a neutral near-black palette, independent of the system theme. System fonts and local assets keep the interface available offline. Existing Magic UI attribution is retained for the adapted editor-entry component.

## Motion contract

- Buttons acknowledge presses with a subtle `scale(0.97)` transition; release takes 160ms, press takes 100ms.
- The mode indicator and switch thumb move with a 160ms CSS transform transition. Rapid changes can retarget the transition.
- Occasional rule-editor and save-feedback entry uses 200ms opacity/transform transitions and `@starting-style`, without delay. No animated layout dimensions or filter blur.
- The shared ease-out curve is `cubic-bezier(0.23, 1, 0.32, 1)`, from Emil's guidance.
- Keyboard input disables transitions and press scaling until the next pointer interaction. Escape closes the editor and returns focus to its entrypoint. Reduced-motion mode disables animation and press movement.
- No continuously moving decoration, animated rule data, hover movement, or remote animation dependencies.

## Verification limits

Native Chrome popup and actual options-page checks cover scoped layout, keyboard focus, state timing, reduced motion, multiline persistence, and narrow layouts. Screenshots support visual inspection; these checks do not measure frame rate, prove screen-reader conformance, or establish native Firefox/Android behavior. See [VERIFICATION.md](VERIFICATION.md) for release gaps.

## Strong Blur update

The popup mode explanation is one text-and-icon row, replacing the layered thumbnail mock that could leave visual remnants. YouTube Blur mode applies a static 48px CSS blur to original content layers with a transparent reveal-control overlay, rather than a solid concealment block. Direct content remains inert and hidden from accessibility until explicitly revealed; Hide still removes matching content. Blur preserves coarse colors and shapes and is not a guarantee that an image cannot be recognized.

Blurred content is clipped to a 16px corner radius. The 44px eye icon button is labeled “Reveal for 3 seconds”; expiry re-evaluates current rules and metadata. A removed rule does not reblur an item, recycled videos do not inherit a reveal, Hide takes precedence immediately, and disposal cancels pending reveal timers. Initial filtering stays immediate. A deliberate pointer reveal uses 200ms transitions, with the return beginning at 2.8 seconds so full blur is restored by the three-second deadline. Keyboard activation and reduced-motion mode stay instant.

## Deliberate reveal motion

The temporary reveal uses interruptible CSS transitions with Emil's shared `cubic-bezier(0.23, 1, 0.32, 1)` curve: 200ms for original-content blur and control opacity. This deliberately animates `filter` to preserve the actual live content rather than cloning YouTube renderers or media. It is restricted to explicit pointer reveals; no animated layout or page-load filtering is introduced. Filter rendering cost has not been benchmarked on devices. Recycled identities, Hide, disposal, and the three-second deadline cancel the transition markers and pending cleanup.
