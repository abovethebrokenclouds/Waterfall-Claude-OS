import { useCallback, useState } from "react";
import { api } from "../lib/api";
import type { GenerateShortsResult } from "../lib/types";

interface State {
  loading: boolean;
  error: string | null;
  result: GenerateShortsResult | null;
}

/** Drives the URL -> shorts generation request and exposes loading/error state. */
export function useGenerateShorts() {
  const [state, setState] = useState<State>({
    loading: false,
    error: null,
    result: null,
  });

  const generate = useCallback(async (url: string) => {
    setState({ loading: true, error: null, result: null });
    try {
      const result = await api.generateShorts(url);
      setState({ loading: false, error: null, result });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof Error ? err.message : "Something went wrong",
        result: null,
      });
    }
  }, []);

  const updateShort = useCallback(
    (shortId: string, patch: Partial<GenerateShortsResult["shorts"][number]>) => {
      setState((prev) => {
        if (!prev.result) return prev;
        return {
          ...prev,
          result: {
            ...prev.result,
            shorts: prev.result.shorts.map((s) =>
              s.id === shortId ? { ...s, ...patch } : s,
            ),
          },
        };
      });
    },
    [],
  );

  return { ...state, generate, updateShort };
}
