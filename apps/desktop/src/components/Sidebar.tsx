import type { ComponentType } from "react";
import type { Backend } from "../lib/backend";
import type { DashboardStats } from "../types";
import {
  IconDashboard,
  IconDuplicates,
  IconHistory,
  IconReview,
  IconScan,
  IconSearch,
  IconSettings,
  IconShield,
} from "./icons";

export type PageId =
  | "dashboard"
  | "scan"
  | "review"
  | "search"
  | "duplicates"
  | "history"
  | "settings";

interface NavEntry {
  id: PageId;
  label: string;
  icon: ComponentType<{ size?: number }>;
  count?: (stats: DashboardStats | null) => number;
}

const NAV: NavEntry[] = [
  { id: "dashboard", label: "Dashboard", icon: IconDashboard },
  { id: "scan", label: "Scan", icon: IconScan },
  { id: "review", label: "Review", icon: IconReview, count: (s) => s?.pendingReviews ?? 0 },
  { id: "search", label: "Search", icon: IconSearch },
  { id: "duplicates", label: "Duplicates", icon: IconDuplicates, count: (s) => s?.duplicateGroups ?? 0 },
  { id: "history", label: "Timeline", icon: IconHistory },
  { id: "settings", label: "Settings", icon: IconSettings },
];

export function Sidebar({
  page,
  stats,
  backend,
  onNavigate,
}: {
  page: PageId;
  stats: DashboardStats | null;
  backend: Backend;
  onNavigate: (page: PageId) => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">
          <IconShield size={20} />
        </div>
        <div>
          <div className="brand-title">Local AI Organizer</div>
          <div className="brand-sub">Private, on-device</div>
        </div>
      </div>
      <nav className="nav">
        {NAV.map((entry) => {
          const Icon = entry.icon;
          const count = entry.count ? entry.count(stats) : 0;
          return (
            <button
              key={entry.id}
              className={`nav-item ${page === entry.id ? "active" : ""}`}
              onClick={() => onNavigate(entry.id)}
              type="button"
            >
              <Icon size={17} />
              <span>{entry.label}</span>
              {count > 0 ? <span className="count">{count}</span> : null}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <div className="mode-badge">
          <span className={`dot ${backend.kind === "tauri" ? "online" : "demo"}`} />
          <span>{backend.kind === "tauri" ? "Native core connected" : "Browser demo mode"}</span>
        </div>
        <p className="hint">Files never leave this device. AI only suggests; Rust applies approved changes.</p>
      </div>
    </aside>
  );
}
