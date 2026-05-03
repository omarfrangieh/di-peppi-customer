"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { showToast } from "@/lib/toast";
import SearchInput from "@/components/SearchInput";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useAuth } from "@/components/AuthWrapper";

const ROLES = ["Admin", "Driver", "Manager", "Operator", "Warehouse Lead"];
const ACCOUNT_TYPES = ["Customer", "Employee", "Supplier"];

const ROLE_COLORS: Record<string, string> = {
  Admin: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Manager: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  Operator: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  Driver: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  "Warehouse Lead": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

const titleCase = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "—";

interface User {
  email: string;
  name: string;
  role: string;
  accountType: string;
  phone?: string;
  isActive: boolean;
  lastLogin?: any;
  createdAt?: any;
  updatedAt?: any;
}

export default function UsersPage() {
  const router = useRouter();
  const { session } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("All");
  const [filterType, setFilterType] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [deactivateTarget, setDeactivateTarget] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const [formData, setFormData] = useState({
    email: "",
    name: "",
    phone: "",
    role: "Operator",
    accountType: "Employee",
    assignedWarehouses: [] as string[],
  });

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [emailError, setEmailError] = useState("");

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const usersSnap = await getDocs(collection(db, "users"));
      const usersList: User[] = [];
      usersSnap.forEach((doc) => {
        usersList.push({
          email: doc.id,
          ...doc.data(),
        } as User);
      });
      usersList.sort((a, b) => a.name.localeCompare(b.name));
      setUsers(usersList);
    } catch (err) {
      console.error("Failed to load users:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      if (!formData.email || !formData.name) {
        throw new Error("Email and name are required");
      }

      // Check if user already exists
      const existingSnap = await getDoc(doc(db, "users", formData.email));
      if (existingSnap.exists()) {
        throw new Error("A user with this email already exists");
      }

      // Write directly to Firestore
      const now = serverTimestamp();
      await setDoc(doc(db, "users", formData.email), {
        email: formData.email,
        name: formData.name,
        phone: formData.phone || "",
        role: formData.role || "",
        accountType: formData.accountType || "Employee",
        assignedWarehouses: formData.assignedWarehouses || [],
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      await load();
      setShowAddModal(false);
      resetForm();
    } catch (err: any) {
      setError(err.message || "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setError("");
    setSaving(true);

    try {
      const updates: Record<string, any> = {
        name: formData.name,
        phone: formData.phone || "",
        role: formData.role || "",
        accountType: formData.accountType || "Employee",
        assignedWarehouses: formData.assignedWarehouses || [],
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "users", editingUser.email), updates);

      await load();
      setShowEditModal(false);
      resetForm();
    } catch (err: any) {
      setError(err.message || "Failed to update user");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (email: string) => {
    try {
      await updateDoc(doc(db, "users", email), {
        isActive: false,
        updatedAt: serverTimestamp(),
      });
      await load();
    } catch (err: any) {
      showToast(err.message || "Failed to deactivate user", "error");
    } finally {
      setDeactivateTarget(null);
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      name: user.name,
      phone: user.phone || "",
      role: user.role,
      accountType: user.accountType,
      assignedWarehouses: [],
    });
    setShowChangePassword(false);
    setNewPassword("");
    setError("");
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      email: "",
      name: "",
      phone: "",
      role: "Operator",
      accountType: "Employee",
      assignedWarehouses: [],
    });
    setNewPassword("");
    setError("");
    setEmailError("");
  };


  const filtered = users.filter((u) => {
    const matchSearch =
      (u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.name.toLowerCase().includes(search.toLowerCase())) &&
      (filterRole === "All" || u.role === filterRole) &&
      (filterType === "All" || u.accountType === filterType) &&
      (filterStatus === "All" || (filterStatus === "Active" ? u.isActive : !u.isActive));
    return matchSearch;
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
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold" style={{color: "#B5535A"}}>
              Users
            </h1>
            <span className="text-xs text-gray-400 dark:text-gray-400">{filtered.length} {filtered.length === 1 ? "user" : "users"}</span>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            className="px-4 py-2 text-sm text-white rounded-lg font-medium"
            style={{backgroundColor: "#1B2A5E"}}
          >
            + Add User
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Filters */}
        <div className="flex items-center gap-3 mb-6">
          <SearchInput
            placeholder="Search by email or name..."
            value={search}
            onChange={setSearch}
            className="flex-1"
          />
          <div className="w-36">
            <SearchableSelect value={filterRole === "All" ? "" : filterRole} onChange={v => setFilterRole(v || "All")} options={ROLES} placeholder="All Roles" size="xs" />
          </div>
          <div className="w-40">
            <SearchableSelect value={filterType === "All" ? "" : filterType} onChange={v => setFilterType(v || "All")} options={ACCOUNT_TYPES} placeholder="All Account Types" size="xs" />
          </div>
          <div className="w-36">
            <SearchableSelect value={filterStatus === "All" ? "" : filterStatus} onChange={v => setFilterStatus(v || "All")} options={["Active", "Inactive"]} placeholder="All Status" size="xs" />
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Email</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Role</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Account Type</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Last Login</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => {
                  const isSelf = user.email === session?.email;
                  return (
                    <tr key={user.email} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">{user.email}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{user.name}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLORS[user.role] || "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}>
                          {user.role || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{titleCase(user.accountType)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${user.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                          {user.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                        {user.lastLogin ? new Date(user.lastLogin.toDate()).toLocaleDateString("en-GB") : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditUser(user)}
                            className="text-sm px-2 py-1 rounded border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => { if (!isSelf && user.isActive) setDeactivateTarget(user.email); }}
                            disabled={!user.isActive || isSelf}
                            title={isSelf ? "Cannot deactivate your own account" : undefined}
                            className={`text-sm px-2 py-1 rounded border transition-colors ${
                              !user.isActive || isSelf
                                ? "opacity-40 cursor-not-allowed border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500"
                                : "border-red-300 dark:border-red-700 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                            }`}
                          >
                            Deactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">
                      No users match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddModal && (() => {
        const isValid = formData.email.trim().length > 0 && formData.email.includes("@") && formData.name.trim().length > 0;
        const showAdminHint = formData.role === "Admin" && formData.accountType !== "Employee";
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 rounded-lg shadow-xl max-w-md w-full mx-4">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Add New User</h2>
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); resetForm(); }}
                  className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-white dark:hover:bg-gray-700/60 transition-colors"
                  aria-label="Close"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>

              <form onSubmit={handleAddUser} className="p-6 space-y-4">
                {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 p-2 rounded">{error}</div>}

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => { setFormData({...formData, email: e.target.value}); setEmailError(""); }}
                    onBlur={() => {
                      if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
                        setEmailError("Please enter a valid email address");
                      } else {
                        setEmailError("");
                      }
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="user@example.com"
                    disabled={saving}
                  />
                  {emailError && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{emailError}</p>}
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Full name"
                    disabled={saving}
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="+961 XX XXX XXX"
                    disabled={saving}
                  />
                </div>

                {/* Account Type + Role */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Account Type</label>
                    <SearchableSelect
                      value={formData.accountType || "Employee"}
                      onChange={(newType) => setFormData({ ...formData, accountType: newType, role: newType === "Employee" ? formData.role : "" })}
                      options={ACCOUNT_TYPES}
                      placeholder="— Select —"
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Role</label>
                    <SearchableSelect
                      value={formData.role || ""}
                      onChange={(v) => setFormData({...formData, role: v, accountType: "Employee"})}
                      options={ROLES}
                      placeholder="— No Role —"
                      disabled={saving || formData.accountType !== "Employee"}
                    />
                  </div>
                </div>

                {/* Admin/AccountType mismatch hint */}
                {showAdminHint && (
                  <p className="text-xs text-blue-500 dark:text-blue-400 -mt-2">
                    Admin users are typically set to Account Type "Employee".
                  </p>
                )}

                {/* Info note */}
                <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2">
                  A one-time password (OTP) will be sent to the user&apos;s email each time they sign in. No password setup is required.
                </p>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowAddModal(false); resetForm(); }}
                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !isValid}
                    className={`flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                      !isValid || saving ? "opacity-50 cursor-not-allowed" : "hover:opacity-90"
                    }`}
                    style={{backgroundColor: "#1B2A5E"}}
                  >
                    {saving ? "Creating..." : "Create User"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Deactivate Confirmation Modal */}
      {deactivateTarget && (() => {
        const target = users.find(u => u.email === deactivateTarget);
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
              <h2 className="text-base font-bold text-gray-900 dark:text-white mb-2">Deactivate User</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Are you sure you want to deactivate <span className="font-semibold text-gray-900 dark:text-white">{target?.name || deactivateTarget}</span>? They will lose access immediately.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeactivateTarget(null)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteUser(deactivateTarget)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  Deactivate
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (() => {
        const isSelf = editingUser.email === session?.email;
        const isDemotingSelf = isSelf && session?.role === "Admin" && formData.role !== "Admin";
        const showMismatchHint = formData.accountType === "Customer" && formData.role === "Admin";
        const isValid = formData.name.trim().length > 0;
        const formatLastLogin = (ts: any) => {
          const d = new Date(ts.toDate());
          return d.toLocaleDateString("en-GB") + ", " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        };
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Edit User</h2>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-white dark:hover:bg-gray-700/60 transition-colors"
                  aria-label="Close"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
                {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 p-2 rounded">{error}</div>}

                {/* Email read-only display (FIX 4) */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 text-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <span className="text-gray-500 dark:text-gray-400">{editingUser.email}</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    placeholder="+961 XX XXX XXX"
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={saving}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Account Type</label>
                    <SearchableSelect
                      value={formData.accountType || "Employee"}
                      onChange={(newType) => setFormData({...formData, accountType: newType, role: newType === "Employee" ? formData.role : ""})}
                      options={ACCOUNT_TYPES}
                      placeholder="— Select —"
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Role</label>
                    <SearchableSelect
                      value={formData.role || ""}
                      onChange={(v) => setFormData({...formData, role: v, accountType: "Employee"})}
                      options={ROLES}
                      placeholder="— No Role —"
                      disabled={saving || formData.accountType !== "Employee"}
                    />
                    {isDemotingSelf && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md px-3 py-2 mt-1">
                        ⚠️ You are changing your own role. You may lose admin access after saving.
                      </p>
                    )}
                    {showMismatchHint && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        ℹ️ Admin role is typically for Employee accounts — verify this is intended.
                      </p>
                    )}
                  </div>
                </div>

                {editingUser.lastLogin && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 px-3 py-2 rounded-lg">
                    Last Login: <span className="font-medium text-gray-700 dark:text-gray-300">{formatLastLogin(editingUser.lastLogin)}</span>
                  </div>
                )}

                <div>
                  <button
                    type="button"
                    onClick={() => setShowChangePassword(!showChangePassword)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    {showChangePassword ? "Cancel Password Change" : "Change Password"}
                  </button>
                </div>

                {showChangePassword && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Min 8 chars, 1 uppercase, 1 number"
                      disabled={saving}
                    />
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                    style={{backgroundColor: "#1B2A5E"}}
                    disabled={saving || !isValid}
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
