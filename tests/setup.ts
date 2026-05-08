// Silence pino during tests unless explicitly overridden.
process.env.LOG_LEVEL ??= "silent";
// Tests don't run inside Next, so satisfy lib/env's schema for any module
// that loads it transitively.
process.env.OPENEMR_BASE_URL ??= "https://localhost:9300";
process.env.OPENEMR_SITE ??= "default";
process.env.OAUTH_REDIRECT_URI ??= "http://localhost:3000/callback";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
process.env.SESSION_SECRET ??= "x".repeat(64);

import "@testing-library/jest-dom/vitest";
