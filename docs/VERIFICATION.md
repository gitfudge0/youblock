# Verification evidence

The current page engine is independently authored and MIT-licensed. Earlier engine evidence does not establish correctness of this replacement; the checks below were collected against the replacement source on 2026-11-11. See [COVERAGE.md](COVERAGE.md) for implementation scope and unfinished release gates.

## Replacement architecture

- `page.ts` receives initialized filter settings through the YouBlock content bridge, publishes generation-scoped state, and compiles explicitly enabled local predicates.
- `page-data.ts` observes initial data and same-origin API responses, annotates matching records without deleting response structure, and passes native responses through on failures.
- `quick-menu.ts` owns separate desktop/touch/keyboard actions and confirmation-gated optional native feedback.
- `player-controls.ts` handles reversible audio metadata preferences and identified watching prompts.
- The existing independent DOM, storage, protected-settings and UI modules remain integrated.

## Evidence

| Check | Observed result |
| --- | --- |
| Unit and integration suite | `npm test`: **101 tests passed in eight files**, covering matching, multiline validation, protected storage, content lifecycle, DOM concealment/motion, response annotations, quick menus, and playback preferences |
| Build and packages | `npm run package` passed TypeScript and both browser builds; each ZIP contains the MIT project license, replacement `page.js`, local assets and third-party notices |
| Source and archive audit | No prior project-name references in the current text files or packaged runtime; copied hook files and historical source documents removed; UI screenshots refreshed |
| Independent engine in Chrome | Actual manifest injection checked initial-data/fetch annotations, response status/header preservation, direct-channel isolation, typed predicates, audio-metadata toggle and restoration |
| Quick-menu integration in Chrome | Cancel leaves rules/feedback unchanged; confirmation persists exact video/channel IDs and filters the card; optional native event is single-use; Undo restores rules and interaction; keyboard dismissal restores focus |
| Live Chrome search | GTA search panel title matching, exact-ID child filtering, and rule-removal restoration passed against actual YouTube |
| Live quick-menu boundary | Nine search cards were inspected without exposing tokens; none exposed a native feedback endpoint. Cancel saved no rules or feedback. Feedback requests were intercepted locally; no service-side feedback was sent |
| Native popup and settings | Real toolbar target sizing, multiline atomic validation/persistence, editor focus, theme/motion, and 320/390px settings layouts passed |
| Reload recovery | Actual extension reload retained cached filtering, produced one notice without uncaught invalid-context errors, and recovered after refreshing the tab |
| Protected-settings smoke | Actual UI save, password setup/unlock/relock, and explicit reveal through injected content passed |
| Firefox package | New package installed as a temporary add-on in isolated headless Firefox; no live Firefox UI assertions were performed |
| Firefox lint | Zero errors, two bundled React innerHTML warnings; no warning-free/store-review claim |

Response annotations remain reversible, and direct DOM refreshes retain normalized renderer kinds so channel names cannot gain title-only marks and typed predicates stay consistent. XHR readers preserve synchronous native semantics and cannot wait for asynchronous settings; the bounded DOM startup guard remains necessary. Traversal and retained-root budgets bound work but do not establish universal layout coverage.

Fresh-history CI exposed a final-frame deadline race: removing a transition rule can leave an existing compositor transition running for a fractional frame. Deadline cleanup now explicitly cancels owned filter/control transitions; the browser check pauses the return transition at its midpoint and still requires the exact final blur at expiry. An isolated cancellation-free package failed at 46.3672px instead of 48px; the corrected package passed. The assertion was not weakened to accept an approximate value.

The extra playback-message preference is independently rendered for hidden watch pages and is used as the accessible label for blurred watch content. Audio preference fixtures establish metadata changes and restoration, not measured audible output. Inactivity prompts are constrained to identified watching dialogs and affirmative actions; unrelated confirmations remain untouched.

## Remaining verification

Native Firefox UI/reload, Android/device behavior, the full live surface/control matrix, first-frame exposure, audio leakage, actual feedback-service effects, non-English inactivity prompts, screen readers and device animation performance remain unfinished. Response fixtures do not prove flash-free rendering or service-side behavior. Firefox has not been signed or published to an add-on store.
