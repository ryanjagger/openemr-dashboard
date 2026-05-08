import { z } from "zod";

const ServerEnvSchema = z.object({
  OPENEMR_BASE_URL: z.string().url(),
  OPENEMR_SITE: z.string().min(1).default("default"),

  OAUTH_CLIENT_ID: z.string().min(1).optional(),
  OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  OAUTH_REDIRECT_URI: z.string().url(),

  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters (use `openssl rand -base64 48`)"),

  TEST_PATIENT_ID: z.string().optional(),
  TEST_PATIENT_PID: z.string().optional(),

  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

let cachedServer: z.infer<typeof ServerEnvSchema> | null = null;

export function serverEnv(): z.infer<typeof ServerEnvSchema> {
  if (cachedServer) return cachedServer;
  const parsed = ServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid server env:\n${issues}`);
  }
  cachedServer = parsed.data;
  return cachedServer;
}

export function publicEnv(): z.infer<typeof PublicEnvSchema> {
  const parsed = PublicEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid public env:\n${issues}`);
  }
  return parsed.data;
}

export function requireOAuthClient(): {
  clientId: string;
  clientSecret: string;
} {
  const env = serverEnv();
  if (!env.OAUTH_CLIENT_ID || !env.OAUTH_CLIENT_SECRET) {
    throw new Error(
      "OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET are required. Run `pnpm tsx scripts/register-client.ts` then paste the values into .env.local.",
    );
  }
  return {
    clientId: env.OAUTH_CLIENT_ID,
    clientSecret: env.OAUTH_CLIENT_SECRET,
  };
}
