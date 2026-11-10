# 0014. Native HTML elements instead of Radix and shadcn/ui

**Status:** Accepted, 2026-11-10. Changes the UI component choice in ARCHITECTURE section 3.

## Context
The plan named shadcn/ui on Radix primitives. Radix dialogs lock page scrolling through `react-remove-scroll`, which depends on `react-style-singleton`. Its source (`dist/es2015/singleton.js`, version 2) creates a `<style>` element and writes CSS text into it. The CSP allows only `style-src 'self'` with no `'unsafe-inline'`, so the browser blocks that element. Scroll locking would silently fail and every dialog would log a CSP violation. Loosening the CSP to fit a component library would weaken the main defense against injected content in a password manager.

`sonner`, the planned toast library, also injects its styles at runtime.

## Decision
Build the few needed primitives on the platform: `<dialog>` with `showModal()` for modals, which provides focus containment, Escape to close, and an inert background; plain buttons and lists for menus; and a small `aria-live` region for notifications. Styling stays in Tailwind classes compiled into the stylesheet. `clsx` composes class names.

## Consequences
No runtime style injection, so the strict CSP stays as it is, and there are fewer dependencies to audit. We write and test a little more component code, and do not get Radix's ready-made comboboxes or menus. If one becomes necessary, it must pass a check under the production CSP before adoption.
