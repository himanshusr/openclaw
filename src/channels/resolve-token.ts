/**
 * Shared channel-token resolution logic.
 *
 * Many channel implementations (Discord, Slack, Telegram, etc.) repeat the
 * same "try explicit token → fall back to account token → throw" pattern.
 * This module provides a generic version that channels can delegate to.
 */

export type ResolveChannelTokenParams = {
  explicit?: string;
  fallback?: string;
  /** Normalize/trim the raw token value before checking. */
  normalize?: (raw: string | undefined) => string | undefined;
  /** Error message when neither token is available. */
  errorMessage: string;
};

/**
 * Resolve a channel bot/API token, preferring an explicit override and
 * falling back to an account-level default. Throws if neither is available.
 */
export function resolveChannelToken(params: ResolveChannelTokenParams): string {
  const normalize = params.normalize ?? ((v) => v?.trim() || undefined);
  const explicit = normalize(params.explicit);
  if (explicit) {
    return explicit;
  }
  const fallback = normalize(params.fallback);
  if (!fallback) {
    throw new Error(params.errorMessage);
  }
  return fallback;
}
