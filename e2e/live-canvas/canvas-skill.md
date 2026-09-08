## Canvas

Canvas is built into every comparison and opens from the picker without extra setup. This local `0.2.0-live.1` build displays the original live options in the same document: React state, event handlers, canvas pixels, and existing iframe content can remain active. Use `stack` (default) for wide sections or `data-unship-canvas="grid"` for compact components.

There is no responsive toggle in this build. All options share the browser viewport; narrower component widths can trigger existing container queries but cannot emulate viewport media queries. Resize the real browser to test those.

Live Canvas is experimental. Menus rendered into an external portal can be obscured; verify those interactions on the page. Cross-origin iframe gestures cannot be forwarded to Canvas. Keep the marked group self-contained and report observed incompatibilities instead of rebuilding the user's content as static placeholders.
