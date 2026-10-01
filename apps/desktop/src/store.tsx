import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Backend } from "./lib/backend";
import { getBackend } from "./lib/backendFactory";
import type { AppSettings, CategoryTree, DashboardStats } from "./types";
import { CATEGORY_TREE } from "./lib/categories";

export type ToastKind = "info" | "success" | "error" | "warning";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface AppContextValue {
  backend: Backend;
  ready: boolean;
  categoryTree: CategoryTree;
  settings: AppSettings | null;
  stats: DashboardStats | null;
  dataVersion: number;
  refresh: () => void;
  refreshStats: () => void;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  notify: (kind: ToastKind, message: string) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [categoryTree, setCategoryTree] = useState<CategoryTree>(CATEGORY_TREE);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = await getBackend();
      if (cancelled) return;
      setBackend(resolved);
      const [tree, loadedSettings, loadedStats] = await Promise.all([
        resolved.getCategoryTree(),
        resolved.getSettings(),
        resolved.getStats(),
      ]);
      if (cancelled) return;
      setCategoryTree(tree);
      setSettings(loadedSettings);
      setStats(loadedStats);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshStats = useCallback(() => {
    if (!backend) return;
    void backend.getStats().then(setStats).catch(() => undefined);
  }, [backend]);

  const refresh = useCallback(() => {
    setDataVersion((version) => version + 1);
    refreshStats();
  }, [refreshStats]);

  useEffect(() => {
    if (!backend) return;
    return backend.onWatchedFolderIndexed(() => refresh());
  }, [backend, refresh]);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      if (!backend) return;
      const next = await backend.saveSettings(patch);
      setSettings(next);
    },
    [backend],
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (kind: ToastKind, message: string) => {
      toastId.current += 1;
      const id = toastId.current;
      setToasts((current) => [...current, { id, kind, message }]);
      setTimeout(() => dismissToast(id), 4200);
    },
    [dismissToast],
  );

  const value = useMemo<AppContextValue | null>(() => {
    if (!backend) return null;
    return {
      backend,
      ready: true,
      categoryTree,
      settings,
      stats,
      dataVersion,
      refresh,
      refreshStats,
      updateSettings,
      notify,
      toasts,
      dismissToast,
    };
  }, [backend, categoryTree, settings, stats, dataVersion, refresh, refreshStats, updateSettings, notify, toasts, dismissToast]);

  if (!value) {
    return (
      <div className="empty" style={{ height: "100vh", justifyContent: "center" }}>
        <div className="spin"><IconSpinner /></div>
        <h4>Starting Local AI File Organizer</h4>
        <p className="muted small">Preparing the local index...</p>
      </div>
    );
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function IconSpinner() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}
