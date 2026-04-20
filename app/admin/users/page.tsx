"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db, functions } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";
import { useRouter } from "next/navigation";

const ROLES = ["Admin", "Driver", "Manager", "Operator", "Warehouse Lead"];
const ACCOUNT_TYPES = ["Customer", "Employee", "Supplier"];

const ROLE_COLORS: Record<string, string> = {
  Admin: "bg-blue-100 text-blue-700",
  Manager: "bg-purple-100 text-purple-700",
  Operator: "bg-gray-100 text-gray-700",
  Driver: "bg-orange-100 text-orange-700",
  "Warehouse Lead": "bg-green-100 text-green-700",
};

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
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("All");
  const [filterType, setFilterType] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");

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

      const createUserFn = httpsCallable(functions, "createUser");
      await createUserFn({
        email: formData.email,
        name: formData.name,
        phone: formData.phone,
        role: formData.role,
        accountType: formData.accountType,
        assignedWarehouses: formData.assignedWarehouses,
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
      const updateUserFn = httpsCallable(functions, "updateUser");
      await updateUserFn({
        userId: editingUser.email,
        name: formData.name,
        phone: formData.phone,
        role: formData.role,
        accountType: formData.accountType,
        assignedWarehouses: formData.assignedWarehouses,
      });

      if (showChangePassword && newPassword) {
        const resetPasswordFn = httpsCallable(functions, "resetPassword");
        await resetPasswordFn({
          userId: editingUser.email,
          newPassword,
        });
      }

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
    if (!confirm("Are you sure you want to deactivate this user?")) return;

    try {
      const deleteUserFn = httpsCallable(functions, "deleteUser");
      await deleteUserFn({userId: email});
      await load();
    } catch (err: any) {
      alert(err.message || "Failed to delete user");
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      name: user.name,
      password: "",
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
      password: "",
      phone: "",
      role: "Operator",
      accountType: "Employee",
      assignedWarehouses: [],
    });
    setNewPassword("");
    setError("");
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold" style={{color: "#B5535A"}}>
              Users
            </h1>
            <span className="text-xs text-gray-400">{filtered.length} users</span>
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

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Filters */}
        <div className="flex items-center gap-3 mb-6">
          <input
            type="text"
            placeholder="Search by email or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none flex-1"
          />
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none"
          >
            <option value="All">All Roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none"
          >
            <option value="All">All Account Types</option>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none"
          >
            <option value="All">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">No users found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Email</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Role</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Account Type</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Last Login</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user) => (
                    <tr key={user.email} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">{user.email}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{user.name}</td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                            ROLE_COLORS[user.role] || "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{user.accountType}</td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                            user.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          }`}
                        >
                          {user.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {user.lastLogin
                          ? new Date(user.lastLogin.toDate()).toLocaleDateString("en-GB")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditUser(user)}
                            className="text-blue-600 hover:text-blue-700 font-medium text-xs"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user.email)}
                            disabled={!user.isActive}
                            className="text-red-600 hover:text-red-700 font-medium text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Deactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Add New User</h2>
            </div>
            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="user@example.com"
                  disabled={saving}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Full name"
                  disabled={saving}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Phone number"
                  disabled={saving}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Account Type</label>
                  <select
                    value={formData.accountType || "Employee"}
                    onChange={(e) => {
                      const newType = e.target.value;
                      setFormData({
                        ...formData,
                        accountType: newType,
                        role: newType === "Employee" ? formData.role : "",
                      });
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={saving}
                  >
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Role</label>
                  <select
                    value={formData.role || ""}
                    onChange={(e) => setFormData({...formData, role: e.target.value, accountType: "Employee"})}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={saving || formData.accountType !== "Employee"}
                  >
                    <option value="">-- No Role --</option>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg"
                  style={{backgroundColor: "#1B2A5E"}}
                  disabled={saving}
                >
                  {saving ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Edit User</h2>
            </div>
            <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
              {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}

              <div className="text-sm text-gray-500 bg-gray-50 p-2 rounded">
                Email: <span className="font-medium text-gray-700">{editingUser.email}</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={saving}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={saving}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Account Type</label>
                  <select
                    value={formData.accountType || "Employee"}
                    onChange={(e) => {
                      const newType = e.target.value;
                      setFormData({
                        ...formData,
                        accountType: newType,
                        role: newType === "Employee" ? formData.role : "",
                      });
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={saving}
                  >
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Role</label>
                  <select
                    value={formData.role || ""}
                    onChange={(e) => setFormData({...formData, role: e.target.value, accountType: "Employee"})}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={saving || formData.accountType !== "Employee"}
                  >
                    <option value="">-- No Role --</option>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {editingUser.lastLogin && (
                <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                  Last Login: {new Date(editingUser.lastLogin.toDate()).toLocaleString("en-GB")}
                </div>
              )}

              <div>
                <button
                  type="button"
                  onClick={() => setShowChangePassword(!showChangePassword)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  {showChangePassword ? "Cancel Password Change" : "Change Password"}
                </button>
              </div>

              {showChangePassword && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Min 8 chars, 1 uppercase, 1 number"
                    disabled={saving}
                  />
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg"
                  style={{backgroundColor: "#1B2A5E"}}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
