import type { ReactElement } from 'react';
import { ApiClientError } from '../api/client';

/**
 * Render whatever an API call threw, in terms an admin can act on.
 *
 * The requestId is shown when the server sent one: it is the only thing that ties "the export
 * button did nothing" to the matching line in the API logs.
 */
export function ErrorBanner({ error }: { error: unknown }): ReactElement | null {
  if (!error) return null;

  if (error instanceof ApiClientError) {
    return (
      <div className="banner banner-error" role="alert">
        <strong>{error.message}</strong>
        <span className="banner-meta">
          {error.code}
          {error.requestId ? ` · request ${error.requestId}` : ''}
        </span>
      </div>
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : 'Something went wrong. Check that the API is reachable.';

  return (
    <div className="banner banner-error" role="alert">
      <strong>{message}</strong>
    </div>
  );
}
