import { useCallback, useEffect, useState } from "react";
import { getSuggestions } from "../lib/api";
import type { SuggestionKind } from "../types/models";

/** Loads autocomplete values for the given kinds; call `refresh` after saving. */
export function useSuggestions(kinds: SuggestionKind[]) {
  const key = kinds.join("|");
  const [values, setValues] = useState<Partial<Record<SuggestionKind, string[]>>>({});

  const refresh = useCallback(async () => {
    const list = key ? (key.split("|") as SuggestionKind[]) : [];
    try {
      const entries = await Promise.all(list.map(async (k) => [k, await getSuggestions(k)] as const));
      setValues(Object.fromEntries(entries));
    } catch {
      // Suggestions are a convenience; a failure here should not block data entry.
    }
  }, [key]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { values, refresh };
}
