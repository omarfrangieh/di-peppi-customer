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

const ACTION_LABELS: Record<string, string> = {
  created_user: "Created User",
  updated_user: "Updated User",
  deleted_user: "Deleted User",
  reset_password: "Reset Password",
  logged_in: "Logged In",
  created_order: "Created Order",
  updated_order: "Updated Order",
  created_invoice: "Created Invoice",
  updated_invoice: "Updated Invoice",
  consolidated_inventory: "Consolidated Inventory",
  created_stock_movement: "Created Stock Movement",
};

const ACTION_COLORS: Record<string, string> = {
  created_user: "bg-green-100 text-green-700",
  updated_user: "bg-blue-100 text-blue-700",
  deleted_user: "bg-red-100 text-red-700",
  reset_password: "bg-yellow-100 text-yellow-700",
  logged_in: "bg-purple-100 text-purple-700",
  created_order: "bg-green-100 text-green-700",
  updated_order: "bg-blue-100 text-blue-700",
  created_invoice: "bg-green-100 text-green-700",
  updated_invoice: "bg-blue-100 text-blue-700",
  consolidated_inventory: "bg-orange-100 text-orange-700",
  created_stock_movement: "bg-blue-100 text-blue-700",
};

export default function AuditLogPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState("All");
  const [filterUser, setFilterUser] = useState("");
  const [filterEntity, setFilterEntity] = useState("All");
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
        actions.add(data.action);
        entities.add(data.entityType);
      });

      setLogs(logsList);
      setUniqueActions(Array.from(actions).sort());
      setUniqueEntities(Array.from(entities).sort());
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = logs.filter((log) => {
    const matchAction = filterAction === "All" || log.action === filterAction;
    const matchUser =
      !filterUser || log.userId.toLowerCase().includes(filterUser.toLowerCase());
    const matchEntity = filterEntity === "All" || log.entityType === filterEntity;
    return matchAction && matchUser && matchEntity;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold" style={{color: "#B5535A"}}>
                Audit Log
              </h1>
              <span className="text-xs text-gray-400">{filtered.length} entries</span>
            </div>
            <button
              onClick={load}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
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
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none flex-1"
            />
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none"
            >
              <option value="All">All Actions</option>
              {uniqueActions.map((action) => (
                <option key={action} value={action}>
                  {ACTION_LABELS[action] || action}
                </option>
              ))}
            </select>
            <select
              value={filterEntity}
              onChange={(e) => setFilterEntity(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none"
            >
              <option value="All">All Entities</option>
              {uniqueEntities.map((entity) => (
                <option key={entity} value={entity}>
                  {entity}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Logs List */}
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">No audit entries found.</div>
          ) : (
            filtered.map((log) => (
              <div
                key={log.id}
                className="bg-white rounded-lg border border-gray-200 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-all"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${
                        ACTION_COLORS[log.action] || "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                    <span className="text-sm text-gray-700 font-medium truncate">
                      {log.entityType}
                    </span>
                    <span className="text-xs text-gray-500 truncate">{log.entityId}</span>
                  </div>
                  <div className="flex items-center gap-4 ml-4 shrink-0">
                    <div className="text-right">
                      <p className="text-xs font-medium text-gray-900">{log.userId}</p>
                      <p className="text-xs text-gray-500">
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
                  <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                    <pre className="text-xs text-gray-600 overflow-auto">
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
