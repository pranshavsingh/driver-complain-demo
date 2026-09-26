import { useMemo, useEffect } from 'react';
import * as api from '../api/endpoints';
import { useApiResource } from './useApiResource';
import { useRealtime } from '../realtime/RealtimeProvider';
import type { CategorySlaItem } from '@driver-complaint/shared-types';

export function useCategorySlaMap() {
  const resource = useApiResource('settings:sla', () => api.settings.getCategorySla());
  const { subscribeCustom } = useRealtime();

  useEffect(() => {
    const unsub = subscribeCustom('settings:sla-updated', () => {
      void resource.reload();
    });
    return () => unsub();
  }, [subscribeCustom, resource]);

  const slaMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    if (resource.data) {
      for (const item of resource.data as CategorySlaItem[]) {
        map[item.category] = item.slaHours;
      }
    }
    return map;
  }, [resource.data]);

  return {
    slaMap,
    slaList: resource.data ?? [],
    loading: resource.loading,
    error: resource.error,
    reload: resource.reload,
  };
}
