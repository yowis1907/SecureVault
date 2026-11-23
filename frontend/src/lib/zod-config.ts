import { z } from 'zod';

/**
 * Zod normally tries `new Function` to compile faster validators. The CSP forbids it (no
 * 'unsafe-eval', and Trusted Types guard the Function constructor), so the attempt only produces
 * violation reports. jitless skips the attempt. Zod reads this when a schema is created, so this
 * module is imported first in main.tsx, before any schema exists.
 */
z.config({ jitless: true });
