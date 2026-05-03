"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

interface AuditEntry {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, any>;
  timestamp: any;
}

const formatActionLabel = (a: string) =>
  a.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const getActionColor = (a: string) => {
  const s = (a || "").toLowerCase();
  if (s.includes("delete")) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
  if (s.includes("create")) return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
  if (s.includes("login") || s.includes("logged_in"))
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
  if (s.includes("update")) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
  return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
};

export default function AuditLogPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState("All");
  const [filterUser, setFilterUser] = useState("");
  const [filterEntity, setFilterEntity] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uniqueActions, setUniqueActions] = useState<string[]>([]);
  const [uniqueEntities, setUniqueEntities] = useState<string[]>([]);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const logsSnap = await getDocs(
        query(collection(db, "auditLog"), orderBy("timestamp", "desc"), limit(500))
      );
      const logsList: AuditEntry[] = [];
      const actions = new Set<string>();
      const entities = new Set<string>();

      logsSnap.forEach((doc) => {
        const data = doc.data();
        logsList.push({
          id: doc.id,
          userId: data.userId,
          action: data.action,
          entityType: data.entityType,
          entityId: data.entityId,
          details: data.details,
          timestamp: data.timestamp,
        });
        if (data.action) actions.add(data.action);
        if (data.entityType) entities.add(data.entityType);
      });

      setLogs(logsList);
      setUniqueActions(Array.from(actions).filter(Boolean).sort());
      setUniqueEntities(Array.from(entities).filter(Boolean).sort());
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = logs.filter((log) => {
    const matchAction = filterAction === "All" || log.action === filterAction;
    const matchUser =
      !filterUser || (log.userId || "").toLowerCase().includes(filterUser.toLowerCase());
    const matchEntity = filterEntity === "All" || log.entityType === filterEntity;
    let matchDate = true;
    if (dateFrom || dateTo) {
      const ts = log.timestamp?.toDate ? log.timestamp.toDate().getTime() : NaN;
      if (Number.isNaN(ts)) {
        matchDate = false;
      } else {
        if (dateFrom) {
          const from = new Date(dateFrom + "T00:00:00").getTime();
          if (ts < from) matchDate = false;
        }
        if (matchDate && dateTo) {
          const to = new Date(dateTo + "T23:59:59.999").getTime();
          if (ts > to) matchDate = false;
        }
      }
    }
    return matchAction && matchUser && matchEntity && matchDate;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center dark:bg-gray-900">
        <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent dark:border-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 dark:bg-gray-900 dark:border-gray-700 px-4 sm:px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold" style={{color: "#B5535A"}}>
                Audit Log
              </h1>
              <span className="text-xs text-gray-400 dark:text-gray-400">{filtered.length} entries</span>
            </div>
            <button
              onClick={load}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              Refresh
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Filter by user..."
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:outline-none flex-1"
            />
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:outline-none"
            >
              <option value="All">All Actions</option>
              {uniqueActions.map((action, i) => (
                <option key={action || i} value={action}>
                  {formatActionLabel(action)}
                </option>
              ))}
            </select>
            <select
              value={filterEntity}
              onChange={(e) => setFilterEntity(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:outline-none"
            >
              <option value="All">All Entities</option>
              {uniqueEntities.map((entity, i) => (
                <option key={entity || i} value={entity}>
                  {entity}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="From date"
              className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:outline-none"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="To date"
              className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Logs List */}
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400 dark:text-gray-400">No audit entries found.</div>
          ) : (
            filtered.map((log) => (
              <div
                key={log.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${getActionColor(log.action)}`}
                    >
                      {formatActionLabel(log.action)}
                    </span>
                    <span className="text-sm text-gray-700 dark:text-gray-300 font-medium truncate">
                      {log.entityType}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{log.entityId}</span>
                  </div>
                  <div className="flex items-center gap-4 ml-4 shrink-0">
                    <div className="text-right">
                      {log.userId ? (
                        <p className="text-xs font-medium text-gray-900 dark:text-white">{log.userId}</p>
                      ) : (
                        <p className="text-xs italic text-gray-400 dark:text-gray-500">Unknown user</p>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {log.timestamp
                          ? new Date(log.timestamp.toDate()).toLocaleString("en-GB")
                          : "—"}
                      </p>
                    </div>
                    <span className={`text-gray-400 transition-transform ${
                      expandedId === log.id ? "rotate-180" : ""
                    }`}>
                      ▼
                    </span>
                  </div>
                </button>

                {expandedId === log.id && log.details && (
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
                    <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-auto">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
