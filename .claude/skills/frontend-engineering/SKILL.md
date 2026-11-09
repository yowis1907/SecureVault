---
name: frontend-engineering
description: Use when writing or changing SecureVault frontend code under frontend/, including React components, routes, forms, data fetching, the design system, responsive layout, accessibility, or browser-side handling of sensitive data.
---

# Frontend Engineering for SecureVault

Stack: React 19, TypeScript 6 in strict mode, Vite 8, Tailwind CSS 4, shadcn/ui on Radix, React Router 8, TanStack Query 5, React Hook Form with Zod 4.

TypeScript stays on 6.0.x until `typescript-eslint` supports 7.x. Check its peer range before upgrading.

## Structure

```
frontend/src
├── app/           router, providers, layouts
├── crypto/        pure crypto functions, no React imports
├── vault-session/ DEK holder, decrypted store, lock logic
├── features/      auth, vault, generator, security, settings, account, landing
├── components/ui/ design-system primitives
├── lib/           api client, formatting
└── workers/       Argon2 worker
```

Features may import from `crypto`, `vault-session`, `components`, and `lib`. Features do not import from each other. `crypto` imports nothing from the app.

## Sensitive data rules

- The DEK is a non-extractable `CryptoKey` held in module scope inside `vault-session`. It never goes into React state, context, props, or TanStack Query.
- Decrypted records live only in the `vault-session` store and are read through `useSyncExternalStore`.
- TanStack Query caches ciphertext DTOs only. Lock clears the vault queries.
- Nothing sensitive goes in `localStorage`, `sessionStorage`, IndexedDB, URLs, or `console.*`. Theme preference may use `localStorage`.
- Reset tokens arrive in the URL **fragment** and are removed with `history.replaceState` immediately after reading.
- Argon2 runs in a Web Worker so the interface stays responsive.
- Never use `dangerouslySetInnerHTML`. Validate that URLs are `http:` or `https:` before rendering them as links, and use `rel="noreferrer noopener"`.
- Password inputs for secrets use the correct `autocomplete` value and are masked by default.
- Do not add inline scripts or a dependency that needs `unsafe-inline` or `unsafe-eval`. The CSP allows only `wasm-unsafe-eval`.
- Do not claim in UI copy that memory is erased or that auto-lock defeats every attack.

## Design

Use the tokens defined in `src/styles`. Do not use arbitrary colors or one-off spacing. Before building a new screen, load the `frontend-design` skill and read the visual direction in `docs/PROJECT_PLAN.md`.

Every data view needs loading (skeleton where the layout is known), empty, error, and success states. Destructive actions need a confirmation dialog. Destructive vault actions also need typed confirmation.

## Accessibility and responsiveness

- All interactive elements are keyboard reachable with a visible focus ring.
- Inputs have associated labels, and errors are announced with `aria-describedby` and `role="alert"`.
- Text contrast meets WCAG AA in both themes. Respect `prefers-reduced-motion`.
- Check layouts at 375, 768, and 1280 px wide.

## Checklist before calling a frontend task done

- [ ] `npm run lint`, `npm run typecheck`, and `npm test` were actually run and passed
- [ ] No sensitive value is stored, logged, or put in a URL
- [ ] Loading, empty, and error states exist
- [ ] Verified in a real browser in both themes and at phone width, with no CSP violations in the console
- [ ] Keyboard-only path works

## Expected output

The purpose of the change, the files changed, the checks run with results, and a short note on any React or TypeScript concept worth learning from the change.
