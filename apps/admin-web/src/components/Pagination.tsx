import type { ReactElement } from 'react';
import type { PaginationMeta } from '@driver-complaint/shared-types';
import { ChevronLeft, ChevronRight } from './Icons';

interface PaginationProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  disabled?: boolean;
  itemLabel?: string;
}

export function Pagination({
  meta,
  onPageChange,
  onPageSizeChange,
  disabled = false,
  itemLabel = 'item',
}: PaginationProps): ReactElement {
  const { page, pageSize, total, totalPages } = meta;
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const actualTotalPages = Math.max(totalPages, 1);

  const getPageNumbers = () => {
    const pages: (number | '...')[] = [];
    if (actualTotalPages <= 7) {
      for (let i = 1; i <= actualTotalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      const start = Math.max(2, page - 1);
      const end = Math.min(actualTotalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < actualTotalPages - 2) pages.push('...');
      pages.push(actualTotalPages);
    }
    return pages;
  };

  return (
    <div className="pagination-wrapper">
      <div className="pagination-left">
        <span className="pagination-summary">
          {total === 0
            ? `No ${itemLabel}s`
            : `Showing ${String(first)}–${String(last)} of ${String(total)} ${itemLabel}${total === 1 ? '' : 's'}`}
        </span>

        {onPageSizeChange ? (
          <div className="page-size-selector">
            <label htmlFor="pageSizeSelect" className="page-size-label">Rows:</label>
            <select
              id="pageSizeSelect"
              className="page-size-select"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              disabled={disabled}
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        ) : null}
      </div>

      <div className="pagination-controls">
        <button
          type="button"
          className="btn-page-nav"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || page <= 1}
          title="Previous Page"
        >
          <ChevronLeft size={16} /> Prev
        </button>

        <div className="pagination-numbers">
          {getPageNumbers().map((p, i) =>
            p === '...' ? (
              <span key={`ellipsis-${i}`} className="pagination-ellipsis">…</span>
            ) : (
              <button
                key={p}
                type="button"
                className={`btn-page-number ${p === page ? 'active' : ''}`}
                onClick={() => onPageChange(p)}
                disabled={disabled}
              >
                {p}
              </button>
            )
          )}
        </div>

        <button
          type="button"
          className="btn-page-nav"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= actualTotalPages}
          title="Next Page"
        >
          Next <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
