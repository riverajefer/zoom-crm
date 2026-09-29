export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}

export interface ApiResponse<T> {
  data: T;
  statusCode: number;
  message?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface PaginatedMetaResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    /** Suma de `total` de todo lo filtrado (OP y COT), para el subtotal por sede. */
    sumTotal?: string;
  };
}
