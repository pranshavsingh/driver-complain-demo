import type { Response } from 'express';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 250;
export const MAX_PAGE_SIZE = 250;

export interface PaginationParams {
  page?: number | string;
  pageSize?: number | string;
  paginate?: boolean | string;
}

export interface ParsedPagination {
  page: number;
  pageSize: number;
  skip: number;
  isPaginated: boolean;
}

export interface PaginationMetadata {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMetadata;
}

export function parsePagination(params?: PaginationParams): ParsedPagination {
  let page = parseInt(String(params?.page || DEFAULT_PAGE), 10);
  if (isNaN(page) || page < 1) page = DEFAULT_PAGE;

  let pageSize = parseInt(String(params?.pageSize || DEFAULT_PAGE_SIZE), 10);
  if (isNaN(pageSize) || pageSize < 1) pageSize = DEFAULT_PAGE_SIZE;
  if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE;

  const isPaginated = String(params?.paginate).toLowerCase() === 'true';

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    isPaginated,
  };
}

export function buildPaginationMetadata(
  total: number,
  page: number,
  pageSize: number
): PaginationMetadata {
  const totalPages = Math.ceil(total / pageSize);
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

export function setPaginationHeaders(
  res: Response,
  meta: PaginationMetadata
): void {
  res.setHeader('X-Total-Count', meta.total.toString());
  res.setHeader('X-Page', meta.page.toString());
  res.setHeader('X-Page-Size', meta.pageSize.toString());
  res.setHeader('X-Total-Pages', meta.totalPages.toString());
  res.setHeader('X-Has-Next-Page', meta.hasNextPage.toString());
  res.setHeader('X-Has-Prev-Page', meta.hasPrevPage.toString());
}

