import type { ReactElement } from 'react';
import type { PaginationMeta } from '@driver-complaint/shared-types';

interface Props {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export function Pagination({ meta, onPageChange, disabled = false }: Props): ReactElement {
  const { page, pageSize, total, totalPages } = meta;
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="pagination">
      <span className="pagination-summary">
        {total === 0
          ? 'No complaints'
          : `${String(first)}–${String(last)} of ${String(total)} complaint${total === 1 ? '' : 's'}`}
      </span>
      <div className="pagination-controls">
        <button
          type="button"
          onClick={() => {
            onPageChange(page - 1);
          }}
          disabled={disabled || page <= 1}
        >
          ← Previous
        </button>
        <span className="pagination-page">
          Page {String(page)} of {String(Math.max(totalPages, 1))}
        </span>
        <button
          type="button"
          onClick={() => {
            onPageChange(page + 1);
          }}
          disabled={disabled || page >= totalPages}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
