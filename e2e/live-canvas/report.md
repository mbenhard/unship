# Live Canvas feasibility test

## Result

The same-document approach works for the tested live components without cloning, iframe app reloads, or DOM reparenting. It is promising, but not ready to replace the installed Canvas: a conventional portal menu rendered outside its component is occluded by the Canvas top layer.

The prototype is available at http://127.0.0.1:4173/live-canvas. Source, fixture, checks, and findings are saved in `e2e/live-canvas/`. Generated bundles and browser artifacts remain under `.unship/live-canvas/`. The adapter can be packaged with matching instructions as a private local candidate; the default source runtime is unchanged apart from the copy-pill spacing adjustment.

## Method

The browser's manual popover/top-layer mechanism displays the original option nodes above the app while preserving their DOM parents. The existing Canvas engine positions empty measurement frames; their screen positions and scale are applied to the actual components. Closing restores modified styles and visibility. No live components are moved into another parent or document.

Existing pan, zoom, Fit, theme and exit controls are retained. The responsive toggle is absent from this prototype. React 19.1.1 and Chromium were used for the browser tests.

## Verified

- Two React options remained exactly the same DOM nodes under the same parents.
- React effect mount count remained 2 across entry, editing and repeated entry/exit.
- Counter updates, controlled input edits and expanding React-rendered content worked live; state survived exit.
- Existing canvas pixels remained intact.
- Two Web Component connection counts remained 2; their shadow content stayed visible.
- Two embedded iframe windows retained identity and counter state. Their load count remained 2.
- The existing CSS animation object retained identity.
- No additional network requests occurred during the measured open/edit/zoom/pan/close/reopen sequence.
- Inherited color survived an ancestor grid, clipping container and transform.
- Original inline styles, chosen-option visibility, and page x/y/width were restored. Height was allowed to change after the user expanded content.
- Camera zoom aligned the actual element and placeholder widths (448px each in the test); a 60px drag moved the card 60px; pinch default handling was captured.
- No JavaScript page errors were observed in the tested sequences.

Raw results: `results.json`, `edge-results.json`, and `wheel-results.json`. Re-run with `node e2e/live-canvas/build.mjs`, then `node e2e/live-canvas/check-live.mjs` and `node e2e/live-canvas/check-edges.mjs` from the repository root while the preview server is running.

## Responsive experiment

At a 1440px viewport, setting the real card to 390px produced:

- Viewport media query: desktop.
- Container query: narrow.

Applying CSS zoom of 3 to the document still left `innerWidth` at 1440 and `(max-width: 600px)` false. Resizing the actual browser viewport to 390 switched the media query to mobile.

Conclusion: component sizing is useful where app CSS already uses container queries. It does not faithfully emulate independent mobile viewports for arbitrary apps using media queries or JavaScript viewport checks. Rewriting queries or overriding individual browser APIs would not provide an equivalent general viewport. Genuine independent viewports require separate browsing contexts or browser-level emulation. Removing the responsive toggle is appropriate for this same-document prototype.

## Remaining limitations

The tested React portal menu exists in `document.body` but is not the hit-test target at its own coordinates because the Canvas top layer is above it. Raising z-index cannot cross that boundary. Supporting arbitrary portal overlays needs additional work; do not describe this prototype as universally compatible.

Other production-readiness gaps include pre-existing popovers, nested modal behavior, keyboard/assistive-technology coverage, component removal while Canvas is open, and applications changing the same root inline styles that the prototype temporarily overrides. Browser coverage beyond Chromium and performance with large numbers of animated options remain untested.

The test adapter is layered on a generated copy of the existing engine. Unused snapshot code has not been removed from that generated copy. Zero repeated app initialization is a measured benefit here; no package-size, CPU, or memory improvement is claimed yet.

## Recommendation

Keep testing this direction, resolve the portal-overlay boundary, then decide whether to replace the snapshot renderer. Do not add a fake responsive mode. The prototype validates the central idea, not a production migration.

## Wheel panning correction

The inherited wheel handler accepted only targets inside `.canvas-viewport`; original live option nodes retain their own DOM ancestry and therefore failed that check. It now also recognizes live options through the composed event path. Accessible iframe documents relay wheel events to their embedding element because wheel events do not bubble across document boundaries. Cross-origin iframe contents are not covered by this bridge.

Chromium wheel tests verified exactly one 12px/24px camera movement over card controls, shadow content, and the fixture iframe, including after reopening. Native inner scrolling takes priority while it can scroll; at its edge the gesture pans Canvas unless overscroll containment is requested. Pinch capture and ordinary component clicks still work. Both previous integration suites passed again with no page errors.

Re-run: `node e2e/live-canvas/check-wheel.mjs`.
