import { useMemo, useState } from "react";
import { AppProvider, useApp } from "./store";
import { Sidebar, type PageId } from "./components/Sidebar";
import { ToastStack } from "./components/ui";
import { DashboardPage } from "./pages/DashboardPage";
import { ScanPage } from "./pages/ScanPage";
import { ReviewPage } from "./pages/ReviewPage";
import { SearchPage } from "./pages/SearchPage";
import { DuplicatesPage } from "./pages/DuplicatesPage";
import { HistoryPage } from "./pages/HistoryPage";
import { SettingsPage } from "./pages/SettingsPage";

const TITLES: Record<PageId, { title: string; subtitle: string }> = {
  dashboard: { title: "Dashboard", subtitle: "Index health, pending reviews and recent activity" },
  scan: { title: "Scan", subtitle: "Index a folder locally - metadata, hashing and analysis" },
  review: { title: "Review", subtitle: "Approve, edit or ignore classification suggestions" },
  search: { title: "Search", subtitle: "Find files by meaning, tags or filename" },
  duplicates: { title: "Duplicates", subtitle: "Exact duplicates detected by SHA-256" },
  history: { title: "File timeline", subtitle: "Every applied operation, fully reversible" },
  settings: { title: "Settings", subtitle: "Ignore list, rules, AI models and privacy" },
};

function Shell() {
  const { stats, backend, toasts, dismissToast } = useApp();
  const [page, setPage] = useState<PageId>("dashboard");

  const header = useMemo(() => TITLES[page], [page]);

  return (
    <div className="app-shell">
      <Sidebar page={page} stats={stats} backend={backend} onNavigate={setPage} />
      <main className="main">
        <header className="topbar">
          <div>
            <h1>{header.title}</h1>
            <p className="subtitle">{header.subtitle}</p>
          </div>
        </header>
        <div className="content">
          {page === "dashboard" ? <DashboardPage onNavigate={setPage} /> : null}
          {page === "scan" ? <ScanPage onNavigate={setPage} /> : null}
          {page === "review" ? <ReviewPage /> : null}
          {page === "search" ? <SearchPage /> : null}
          {page === "duplicates" ? <DuplicatesPage /> : null}
          {page === "history" ? <HistoryPage /> : null}
          {page === "settings" ? <SettingsPage /> : null}
        </div>
      </main>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
