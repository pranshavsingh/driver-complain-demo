import { describe, it, expect } from 'vitest';
import {
  parsePagination,
  buildPaginationMetadata,
  setPaginationHeaders,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../lib/pagination';

describe('M4 — Pagination Engine & Metadata Headers', () => {
  it('applies standard defaults when params are missing or undefined', () => {
    const res = parsePagination();
    expect(res.page).toBe(DEFAULT_PAGE);
    expect(res.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(res.skip).toBe(0);
    expect(res.isPaginated).toBe(false);
  });

  it('clamps invalid or non-numeric page values to default page 1', () => {
    expect(parsePagination({ page: -5 }).page).toBe(1);
    expect(parsePagination({ page: 0 }).page).toBe(1);
    expect(parsePagination({ page: 'not-a-number' as any }).page).toBe(1);
  });

  it('clamps pageSize to MAX_PAGE_SIZE (250) to prevent denial of service', () => {
    const res = parsePagination({ pageSize: 5000 });
    expect(res.pageSize).toBe(MAX_PAGE_SIZE);
  });

  it('computes correct skip offset based on page and pageSize', () => {
    const res = parsePagination({ page: 4, pageSize: 50 });
    expect(res.skip).toBe(150); // (4 - 1) * 50 = 150
  });

  it('parses paginate flag correctly as case-insensitive boolean', () => {
    expect(parsePagination({ paginate: 'true' }).isPaginated).toBe(true);
    expect(parsePagination({ paginate: 'TRUE' }).isPaginated).toBe(true);
    expect(parsePagination({ paginate: 'false' }).isPaginated).toBe(false);
    expect(parsePagination({ paginate: undefined }).isPaginated).toBe(false);
  });

  it('builds accurate pagination metadata for single page results', () => {
    const meta = buildPaginationMetadata(42, 1, 250);
    expect(meta.total).toBe(42);
    expect(meta.page).toBe(1);
    expect(meta.pageSize).toBe(250);
    expect(meta.totalPages).toBe(1);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPrevPage).toBe(false);
  });

  it('builds accurate pagination metadata for multi-page results', () => {
    const meta = buildPaginationMetadata(1005, 3, 100);
    expect(meta.total).toBe(1005);
    expect(meta.page).toBe(3);
    expect(meta.pageSize).toBe(100);
    expect(meta.totalPages).toBe(11); // ceil(1005 / 100) = 11
    expect(meta.hasNextPage).toBe(true);
    expect(meta.hasPrevPage).toBe(true);
  });

  it('sets all required HTTP response headers with stringified integers and booleans', () => {
    const meta = buildPaginationMetadata(500, 2, 100);
    const headers: Record<string, string> = {};
    const mockRes = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    } as any;

    setPaginationHeaders(mockRes, meta);

    expect(headers['X-Total-Count']).toBe('500');
    expect(headers['X-Page']).toBe('2');
    expect(headers['X-Page-Size']).toBe('100');
    expect(headers['X-Total-Pages']).toBe('5');
    expect(headers['X-Has-Next-Page']).toBe('true');
  });
});

