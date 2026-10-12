import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  createBranch as apiCreateBranch,
  deleteBranch as apiDeleteBranch,
  getActiveBranch,
  listBranches,
  setActiveBranch as apiSetActiveBranch,
} from "../lib/api";
import type { Branch } from "../types/models";

interface BranchContextValue {
  branches: Branch[];
  currentBranchId: string;
  currentBranch: Branch | undefined;
  loading: boolean;
  switchBranch: (branchId: string) => Promise<void>;
  createBranch: (name: string) => Promise<Branch>;
  deleteBranch: (branchId: string, pin: string) => Promise<void>;
  refreshBranches: () => Promise<void>;
}

const BranchContext = createContext<BranchContextValue | null>(null);

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranchId, setCurrentBranchId] = useState<string>("main");
  const [loading, setLoading] = useState(true);

  const refreshBranches = useCallback(async () => {
    try {
      const [list, active] = await Promise.all([listBranches(), getActiveBranch()]);
      setBranches(list);
      setCurrentBranchId(active);
    } catch (e) {
      console.error("Failed to fetch branches", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshBranches();
  }, [refreshBranches]);

  const switchBranch = useCallback(
    async (branchId: string) => {
      try {
        await apiSetActiveBranch(branchId);
        setCurrentBranchId(branchId);
        await refreshBranches();
      } catch (e) {
        console.error("Failed to set active branch", e);
        throw e;
      }
    },
    [refreshBranches],
  );

  const createBranch = useCallback(
    async (name: string) => {
      try {
        const created = await apiCreateBranch(name);
        await refreshBranches();
        await switchBranch(created.id);
        return created;
      } catch (e) {
        console.error("Failed to create branch", e);
        throw e;
      }
    },
    [refreshBranches, switchBranch],
  );

  const deleteBranch = useCallback(
    async (branchId: string, pin: string) => {
      try {
        await apiDeleteBranch(branchId, pin);
        if (currentBranchId === branchId) {
          setCurrentBranchId("main");
        }
        await refreshBranches();
      } catch (e) {
        console.error("Failed to delete branch", e);
        throw e;
      }
    },
    [currentBranchId, refreshBranches],
  );

  const currentBranch = branches.find((b) => b.id === currentBranchId) || branches[0];

  return (
    <BranchContext.Provider
      value={{
        branches,
        currentBranchId,
        currentBranch,
        loading,
        switchBranch,
        createBranch,
        deleteBranch,
        refreshBranches,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) {
    throw new Error("useBranch must be used within a BranchProvider");
  }
  return ctx;
}
