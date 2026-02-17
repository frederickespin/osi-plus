import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseApiDataOptions<T> {
  /** Function to fetch data from API */
  fetcher: () => Promise<T>;
  /** Optional fallback data if API fails */
  fallback?: T;
  /** Whether to fetch immediately on mount */
  immediate?: boolean;
  /** Dependencies that trigger a refetch */
  deps?: unknown[];
  /** Cache key for localStorage (optional) */
  cacheKey?: string;
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTTL?: number;
}

export interface UseApiDataReturn<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  setData: (data: T | null) => void;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Generic hook for fetching and managing API data with loading states,
 * error handling, and optional caching.
 */
export function useApiData<T>({
  fetcher,
  fallback,
  immediate = true,
  deps = [],
  cacheKey,
  cacheTTL = 5 * 60 * 1000, // 5 minutes default
}: UseApiDataOptions<T>): UseApiDataReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const fetchingRef = useRef(false);

  // Try to load from cache on mount
  useEffect(() => {
    if (cacheKey) {
      try {
        const cached = localStorage.getItem(`api-cache:${cacheKey}`);
        if (cached) {
          const entry: CacheEntry<T> = JSON.parse(cached);
          const isValid = Date.now() - entry.timestamp < cacheTTL;
          if (isValid && entry.data) {
            setData(entry.data);
            setLoading(false);
          }
        }
      } catch {
        // Ignore cache errors
      }
    }
  }, [cacheKey, cacheTTL]);

  const refetch = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await fetcher();
      
      if (mountedRef.current) {
        setData(result);
        setError(null);
        
        // Save to cache if cacheKey is provided
        if (cacheKey && result) {
          try {
            const entry: CacheEntry<T> = {
              data: result,
              timestamp: Date.now(),
            };
            localStorage.setItem(`api-cache:${cacheKey}`, JSON.stringify(entry));
          } catch {
            // Ignore cache write errors
          }
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        
        // Use fallback if available
        if (fallback !== undefined) {
          setData(fallback);
        }
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
      fetchingRef.current = false;
    }
  }, [fetcher, fallback, cacheKey]);

  // Fetch on mount and when deps change
  useEffect(() => {
    mountedRef.current = true;
    
    if (immediate) {
      refetch();
    }
    
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immediate, ...deps]);

  return {
    data,
    loading,
    error,
    refetch,
    setData,
  };
}

/**
 * Hook for paginated API data
 */
export interface UsePaginatedDataOptions<T> extends Omit<UseApiDataOptions<T[]>, 'fetcher'> {
  fetcher: (page: number, pageSize: number) => Promise<{ data: T[]; total: number }>;
  pageSize?: number;
}

export interface UsePaginatedDataReturn<T> extends Omit<UseApiDataReturn<T[]>, 'data'> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  setPage: (page: number) => void;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export function usePaginatedData<T>({
  fetcher,
  fallback = [],
  immediate = true,
  pageSize: initialPageSize = 20,
}: UsePaginatedDataOptions<T>): UsePaginatedDataReturn<T> {
  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(initialPageSize);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await fetcher(page, pageSize);
      
      if (mountedRef.current) {
        setData(result.data);
        setTotal(result.total);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setData(fallback);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [fetcher, page, pageSize, fallback]);

  useEffect(() => {
    mountedRef.current = true;
    
    if (immediate) {
      refetch();
    }
    
    return () => {
      mountedRef.current = false;
    };
  }, [immediate, page, refetch]);

  const totalPages = Math.ceil(total / pageSize);

  return {
    data,
    total,
    page,
    pageSize,
    totalPages,
    setPage,
    loading,
    error,
    refetch,
    setData,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

export default useApiData;
