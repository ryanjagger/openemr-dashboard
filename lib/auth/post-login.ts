export function isSafeReturnTo(value: string | undefined | null): value is string {
  if (!value) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.includes("\\")) return false;
  return true;
}

export function resolveLoginReturnTo(
  requestedReturnTo: string | undefined | null,
): string {
  if (isSafeReturnTo(requestedReturnTo)) return requestedReturnTo;
  return "/";
}
