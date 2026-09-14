import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/apiClient';

export function useArchiveData({
  endpoint,
  active,
  startDate,
  endDate,
  searchTerm,
  statusFilter,
  modalityFilter,
  pageSize = 25
}) {
  const [archiveData, setArchiveData] = useState([]);
  const [archiveTotal, setArchiveTotal] = useState(0);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  // Reset when filters change
  useEffect(() => {
    if (!active || !endpoint) {
      setArchiveData([]);
      setArchiveTotal(0);
      setNextCursor(null);
      setHasMore(false);
      return;
    }

    let isMounted = true;
    const loadFirstPage = async () => {
      setArchiveLoading(true);
      try {
        const params = {
          pageSize,
          search: searchTerm || undefined,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        };

        const res = await apiClient.get(endpoint, { params });
        if (isMounted) {
          if (res.data && Array.isArray(res.data.data || res.data.rows)) {
            const dataArr = res.data.data || res.data.rows;
            setArchiveData(dataArr);
            setArchiveTotal(res.data.totalCount || dataArr.length);
            setNextCursor(res.data.nextCursor);
            setHasMore(!!res.data.nextCursor);
          } else if (Array.isArray(res.data)) {
            setArchiveData(res.data);
            setArchiveTotal(res.data.length);
            setNextCursor(null);
            setHasMore(false);
          }
        }
      } catch (err) {
        console.error('[Archive] fetch failed', err);
      } finally {
        if (isMounted) setArchiveLoading(false);
      }
    };

    loadFirstPage();
    return () => { isMounted = false; };
  }, [active, endpoint, startDate, endDate, searchTerm, statusFilter, modalityFilter, pageSize]);

  const loadMore = useCallback(async () => {
    if (!active || !hasMore || archiveLoading || !nextCursor || !endpoint) return;
    setArchiveLoading(true);
    try {
      const params = {
        pageSize,
        cursor: nextCursor,
        search: searchTerm || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      };
      
      const res = await apiClient.get(endpoint, { params });
      const newItems = res.data?.data || res.data?.rows || res.data || [];
      if (Array.isArray(newItems)) {
        setArchiveData(prev => [...prev, ...newItems]);
        setNextCursor(res.data?.nextCursor);
        setHasMore(!!res.data?.nextCursor);
      }
    } catch (err) {
      console.error('[Archive] loadMore failed', err);
    } finally {
      setArchiveLoading(false);
    }
  }, [active, endpoint, hasMore, archiveLoading, nextCursor, pageSize, searchTerm, statusFilter, startDate, endDate]);

  return { archiveData, archiveTotal, archiveLoading, hasMore, loadMore };
}
