# Desktop interaction research

Reviewed September 12, 2026. The user's expanded scope explicitly adds responsive and touch behavior to the original desktop-only specification. Tokyo Night's palette, tile borders, quiet bar, and sharp geometry remain unchanged.

## Decisions implemented

| Evidence                                                                                                                                                                                                       | Decision in oma.os                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Hyprland dispatchers](https://wiki.hypr.land/Configuring/Dispatchers/) separate focus, workspace movement, resize, and fullscreen operations.                                                                 | Preserve separate desktop commands. A window overview makes these operations discoverable without requiring keyboard memorization. Windows remain mounted when switching workspaces or mobile clients.                           |
| [Keyboard Lock](https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/lock) is a capability with browser and platform limitations, not a way to guarantee interception of every operating-system shortcut. | Keep Cmd+K, Ctrl+Space, clickable launcher, configurable desktop modifier, and optional fullscreen. Never promise that a website can intercept macOS Cmd+Q or Option+Space when another app owns it.                             |
| [WCAG 2.2 target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum/) sets a 24 CSS-pixel minimum subject to exceptions.                                                                    | Use 44px primary targets on coarse-pointer devices. Workspace numbers scroll instead of compressing, mobile clients use the available workspace, and a bottom window strip preserves access to every client.                     |
| [WAI-ARIA window splitter](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/) documents directional resize keys and optional Home/End limits.                                                           | Splits expose separator semantics, orientation, and values. Matching arrows resize; Home/End go to the supported 20%/80% limits; Enter or double-click restores a balanced split. Touch dividers get larger invisible hit areas. |
| [VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport) can shrink for the software keyboard independently of the layout viewport.                                                   | On compact/touch viewports, size the desktop from the visual viewport so the dock and compose controls remain above the keyboard. Keep normal dynamic viewport units on desktop.                                                 |

## Discoverability and accessibility

- The launcher searches application descriptions and keywords as well as titles. Category buttons narrow apps, open windows, files, commands, and workspaces. New app IDs get an icon fallback instead of crashing the launcher.
- Window controls include a live inventory across all nine workspaces, with file paths and unsaved markers. A user can return to a running client instead of launching duplicates.
- Alt+[ and Alt+] cycle current-workspace windows. Ctrl+backtick opens the overview. These are documented alternatives; host interception is still possible.
- Each dialog has a visible close target, keyboard focus containment, and focus restoration. Input-method composition is not interpreted as desktop shortcuts.
- The top bar uses normal layout columns. The focused title truncates within its own allocated space; the clock never occupies an absolute layer above it.
- Reduced-motion preferences suppress desktop transitions.

## Verification and limits

Unit tests cover compositor operations. Browser verification should include 390px phone, 800px compact desktop, 1280px desktop, and coarse-pointer tablet: switch windows, switch workspaces, search the launcher, move/close a client, and resize via keyboard and pointer. Test the actual software keyboard on Safari/Android hardware because resizing a desktop browser does not emulate its keyboard.

Mobile intentionally presents one focused client at a time while retaining the underlying split tree. It restores the tiled arrangement when enough screen space returns. This is responsive presentation, not a second window manager or a separate copy of app state.
