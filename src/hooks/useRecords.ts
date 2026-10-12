import { useCallback, useEffect, useMemo, useState } from "react";
import { useBranch } from "../context/BranchContext";
import { errorMessage, recordApi } from "../lib/api";
import type { BaseRecord, DateFilter, ModuleKey, Totals } from "../types/models";

/**
 * Generic list/create/update/delete hook shared by all five record modules.
 * Totals are computed from the rows shown so they always equal the visible sum.
 */
export function useRecords<T extends BaseRecord & { quantity?: number }, I>(
  module: ModuleKey,
  filter: DateFilter,
) {
  const { currentBranchId } = useBranch();
  const api = useMemo(() => recordApi<T, I>(module), [module]);
  const [records, setRecords] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { from, to } = filter;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(await api.list({ from, to }, currentBranchId));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [api, from, to, currentBranchId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (input: I) => {
      const created = await api.create(input, currentBranchId);
      await reload();
      return created;
    },
    [api, reload, currentBranchId],
  );

  const update = useCallback(
    async (id: number, input: I) => {
      const updated = await api.update(id, input);
      await reload();
      return updated;
    },
    [api, reload],
  );

  const remove = useCallback(
    async (id: number, pin: string) => {
      await api.remove(id, pin);
      await reload();
    },
    [api, reload],
  );

  const totals: Totals = useMemo(
    () =>
      records.reduce<Totals>(
        (acc, r) => ({
          count: acc.count + 1,
          amount: acc.amount + r.amount,
          quantity: acc.quantity + (r.quantity ?? 0),
        }),
        { count: 0, amount: 0, quantity: 0 },
      ),
    [records],
  );

  return { records, totals, loading, error, reload, create, update, remove };
}
