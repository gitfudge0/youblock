# YouBlock coverage

YouBlock uses an independently authored page runtime and DOM adapters. This is a development preview: the code paths below exist, but full live compatibility across browsers and every YouTube layout is not established.

| Area | Implementation | Verification boundary |
| --- | --- | --- |
| Keywords, IDs, regex, per-rule Hide/Blur, multiline entry | `src/core/model.ts`, `matching.ts`, `rule-entry.ts` | Unit matching/validation and browser editor checks |
| Response and initial-data filtering | `src/scripts/page-data.ts` | Independent fetch/XHR/global hooks, reversible annotations, bounded startup; cold-load exposure still needs measurements |
| Cards, comments, replies, Shorts, collections, desktop/mobile grids | `src/scripts/conceal.ts` | DOM fixtures and targeted live Chrome checks; unfamiliar metadata/layouts fail open |
| Watch playback, previews, playlists and autoplay | `src/scripts/conceal.ts` | Scoped pause/mute and known permitted candidate selection; full live audio/autoplay progression remains unverified |
| Blur, timed eye reveal, motion and restoration | `src/scripts/conceal.ts` | 48px blur, rounded clipping, three-second reveal budget, keyboard/reduced-motion and recycled-node checks |
| Quick blocking and Undo | `src/scripts/quick-menu.ts`, `content.ts`, `background.ts` | Separate context menu and touch/keyboard affordance; protected write and confirmation/Undo gates |
| Optional feedback | `src/scripts/quick-menu.ts` | Confirmed single-use native service-event dispatch; service-side effects are not established by fixtures |
| Shorts, Mixes, movies, Explore/Trending, duration and watched percentage | `src/scripts/page-data.ts`, `conceal.ts` | Renderer/metadata and DOM controls; every live layout is not verified |
| History exception and recommendations-only filtering | Page and DOM adapters | Separate handling of direct player data and history routes |
| Advanced local predicate | `src/scripts/page.ts`, page/DOM adapters | Explicit opt-in; imported code disabled; errors preserve ordinary rules; page/browser policy may prohibit evaluation |
| Audio normalization preference | `src/scripts/player-controls.ts` | Reversible changes to known audio response metadata; actual audible output requires device/browser evidence |
| Inactivity prompts | `src/scripts/player-controls.ts` | Identified native watching prompts only; text recognition currently covers English, other locales are unverified |
| Settings protection and local storage | `src/scripts/background.ts`, UI | Password hash, lock/unlock/restart gate, reset, serialization and import validation |
| Chrome/Firefox packaging | `scripts/build.mjs`, `package.mjs` | Separate manifests, local assets, license notices and ZIPs; Firefox is unsigned |

The standalone quick-block menu leaves native YouTube menus intact. Missing exact IDs disable the relevant action rather than guessing a channel from a display name. The optional feedback action requires a successful protected write, an unexpired acknowledgment, current opt-in, and unchanged item identity.

Native Firefox UI/reload, actual Firefox Android devices, full surface coverage, screen readers, first-frame exposure, audio leakage and device animation performance remain release-verification work. Desktop emulation is not Android verification.
