import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const log = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  base: { app: "openemr-dashboard" },
  redact: {
    paths: [
      "accessToken",
      "refreshToken",
      "idToken",
      "*.accessToken",
      "*.refreshToken",
      "*.idToken",
      "authorization",
      "*.authorization",
      "headers.authorization",
      "headers.cookie",
      "*.set-cookie",
      "password",
      "client_secret",
      "code",
    ],
    censor: "[redacted]",
  },
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "HH:MM:ss.l" },
    },
  }),
});

export type AuditEvent = {
  userId?: string;
  patientId?: string;
  resource?: string;
  action: string;
  status: number;
  durationMs: number;
};

export function audit(event: AuditEvent) {
  log.info({ audit: true, ...event }, "audit");
}
