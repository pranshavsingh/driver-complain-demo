import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';

export function NotFoundPage(): ReactElement {
  return (
    <div className="card">
      <h1>Page not found</h1>
      <p className="muted">That address does not exist in this dashboard.</p>
      <Link to="/complaints">Back to complaints</Link>
    </div>
  );
}
