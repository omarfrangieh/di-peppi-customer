"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

const ROLES = ["Admin", "Manager", "Operator", "Driver", "Warehouse Lead"];
const FEATURES = [
  "dashboard",
  "orders",
  "invoices",
  "products",
  "purchaseOrders",
  "customers",
  "suppliers",
  "inventoryCounts",
  "users",
  "auditLog",
  "reports",
  "settings",
];
const PERMISSION_LEVELS = ["full", "edit", "view", "none"];

interface Permissions {
  [role: string]: {
    role: string;
    features: {
      [feature: string]: string;
    };
  };
}

export default function PermissionsPage() {
  const [permissions, setPermissions] = useState<Permissions>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set(["Admin"]));

  useEffect(() => {
    fetchPermissions();
  }, []);

  const fetchPermissions = async () => {
    try {
      const getPermissionsFn = httpsCallable(functions, "getPermissions");
      const result = await getPermissionsFn({});
      setPermissions(result.data as Permissions);
    } catch (err) {
      setMessage("Failed to load permissions");
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionChange = (role: string, feature: string, level: string) => {
    setPermissions((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        features: {
          ...prev[role].features,
          [feature]: level,
        },
      },
    }));
  };

  const handleSave = async (role: string) => {
    setSaving(true);
    setMessage("");

    try {
      const updatePermissionsFn = httpsCallable(functions, "updatePermissions");
      await updatePermissionsFn({
        role,
        features: permissions[role].features,
      });
      setMessage(`✓ Permissions for ${role} updated`);
      setTimeout(() => setMessage(""), 3000);
    } catch (err: any) {
      setMessage(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleRole = (role: string) => {
    const newExpanded = new Set(expandedRoles);
    if (newExpanded.has(role)) {
      newExpanded.delete(role);
    } else {
      newExpanded.add(role);
    }
    setExpandedRoles(newExpanded);
  };

  const filteredRoles = ROLES.filter((role) =>
    role.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Permissions</h1>
        <p className="text-sm text-gray-600">Manage role-based access control</p>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          message.includes("✓")
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {message}
        </div>
      )}

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search roles..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="space-y-4">
        {filteredRoles.map((role) => {
          const rolePermissions = permissions[role] || {
            role,
            features: FEATURES.reduce((acc, f) => ({...acc, [f]: "none"}), {}),
          };

          const isExpanded = expandedRoles.has(role);
          return (
            <div key={role} className="bg-white rounded-lg shadow border border-gray-200">
              <button
                onClick={() => toggleRole(role)}
                className="w-full px-6 py-4 border-b border-gray-200 flex items-center justify-between hover:bg-gray-50 transition-all"
              >
                <h2 className="text-lg font-bold text-gray-900">{role}</h2>
                <span className="text-gray-400">
                  {isExpanded ? "▼" : "▶"}
                </span>
              </button>

              {isExpanded && (
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left font-semibold text-gray-700 pb-3">Feature</th>
                        {PERMISSION_LEVELS.map((level) => (
                          <th key={level} className="text-center font-semibold text-gray-700 pb-3">
                            {level.charAt(0).toUpperCase() + level.slice(1)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {FEATURES.map((feature) => (
                        <tr key={feature} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 text-gray-700 font-medium">
                            {feature.replace(/([A-Z])/g, " $1").trim()}
                          </td>
                          {PERMISSION_LEVELS.map((level) => (
                            <td key={level} className="text-center py-3">
                              <input
                                type="radio"
                                name={`${role}-${feature}`}
                                value={level}
                                checked={
                                  rolePermissions.features[feature] === level
                                }
                                onChange={() =>
                                  handlePermissionChange(role, feature, level)
                                }
                                disabled={saving}
                                className="cursor-pointer"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4">
                  <button
                    onClick={() => handleSave(role)}
                    disabled={saving}
                    className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-all"
                    style={{backgroundColor: "#1B2A5E", opacity: saving ? 0.6 : 1}}
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
