import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../context/ToastContext.js';
import { apiRequest, formatViews, formatRelativeTime } from '../api/client.js';
import { AdminMetrics, Video, ReportItem, Category } from '../types/index.js';
import { ConfirmModal } from '../components/common/ConfirmModal.js';
import { Modal } from '../components/common/Modal.js';
import {
  Shield,
  BarChart3,
  Film,
  Users,
  Layers,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Trash2,
  Star,
  Eye,
  Plus
} from 'lucide-react';

interface AdminPageProps {
  onSelectVideo: (id: string) => void;
  onSelectChannel: (id: string) => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({ onSelectVideo, onSelectChannel }) => {
  const { user } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'analytics' | 'videos' | 'users' | 'categories' | 'moderation'>('analytics');
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [recentUploads, setRecentUploads] = useState<any[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New category modal
  const [isAddCatOpen, setIsAddCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  // Delete video confirmation
  const [videoToDelete, setVideoToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role === 'admin') {
      loadAdminData();
    }
  }, [user, activeTab]);

  const loadAdminData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'analytics') {
        const res = await apiRequest<{ metrics: AdminMetrics; recentUploads: any[] }>('/api/admin/metrics');
        setMetrics(res.metrics);
        setRecentUploads(res.recentUploads || []);
      } else if (activeTab === 'videos') {
        const res = await apiRequest<{ videos: Video[] }>('/api/admin/videos');
        setVideos(res.videos || []);
      } else if (activeTab === 'users') {
        const res = await apiRequest<{ users: any[] }>('/api/admin/users');
        setUsersList(res.users || []);
      } else if (activeTab === 'categories') {
        const res = await apiRequest<{ categories: Category[] }>('/api/categories');
        setCategories(res.categories || []);
      } else if (activeTab === 'moderation') {
        const res = await apiRequest<{ reports: ReportItem[] }>('/api/admin/reports');
        setReports(res.reports || []);
      }
    } catch (err: any) {
      toast.error('Admin Error', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle Featured Video
  const handleToggleFeatured = async (v: Video) => {
    try {
      const res = await apiRequest<{ video: Video }>(`/api/admin/videos/${v._id}`, {
        method: 'PUT',
        body: JSON.stringify({ featured: !v.featured })
      });
      setVideos(prev => prev.map(item => item._id === v._id ? { ...item, featured: res.video.featured } : item));
      toast.success(res.video.featured ? 'Video set as Featured' : 'Featured flag removed');
    } catch (err: any) {
      toast.error('Failed to update featured flag', err.message);
    }
  };

  // Change Video Visibility
  const handleChangeVisibility = async (v: Video, newVis: string) => {
    try {
      await apiRequest(`/api/admin/videos/${v._id}`, {
        method: 'PUT',
        body: JSON.stringify({ visibility: newVis })
      });
      setVideos(prev => prev.map(item => item._id === v._id ? { ...item, visibility: newVis as any } : item));
      toast.success(`Visibility set to ${newVis}`);
    } catch (err: any) {
      toast.error('Failed to update visibility', err.message);
    }
  };

  // Delete Video permanently
  const handleDeleteVideo = async () => {
    if (!videoToDelete) return;
    try {
      await apiRequest(`/api/videos/${videoToDelete}`, { method: 'DELETE' });
      setVideos(prev => prev.filter(v => v._id !== videoToDelete));
      toast.success('Video removed from platform');
    } catch (err: any) {
      toast.error('Failed to delete video', err.message);
    } finally {
      setVideoToDelete(null);
    }
  };

  // Change User Role
  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      await apiRequest(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole })
      });
      setUsersList(prev => prev.map(u => u._id === userId ? { ...u, role: newRole } : u));
      toast.success(`User role updated to ${newRole}`);
    } catch (err: any) {
      toast.error('Role update failed', err.message);
    }
  };

  // Toggle User Status (Active / Suspended)
  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    try {
      await apiRequest(`/api/admin/users/${userId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      setUsersList(prev => prev.map(u => u._id === userId ? { ...u, status: newStatus } : u));
      toast.success(`Account marked as ${newStatus}`);
    } catch (err: any) {
      toast.error('Status update failed', err.message);
    }
  };

  // Add Category
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    try {
      const res = await apiRequest<{ category: Category }>('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name: newCatName, description: newCatDesc })
      });
      setCategories(prev => [...prev, res.category]);
      setIsAddCatOpen(false);
      setNewCatName('');
      setNewCatDesc('');
      toast.success('New Category Created');
    } catch (err: any) {
      toast.error('Failed to create category', err.message);
    }
  };

  // Delete Category
  const handleDeleteCategory = async (catId: string) => {
    try {
      await apiRequest(`/api/categories/${catId}`, { method: 'DELETE' });
      setCategories(prev => prev.filter(c => c._id !== catId));
      toast.success('Category removed');
    } catch (err: any) {
      toast.error('Failed to delete category', err.message);
    }
  };

  // Moderate Report Action
  const handleModerateReport = async (reportId: string, action: 'resolve' | 'dismiss' | 'delete_target') => {
    try {
      await apiRequest(`/api/admin/reports/${reportId}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: action === 'dismiss' ? 'dismissed' : 'resolved',
          action
        })
      });
      setReports(prev =>
        prev.map(r => (r._id === reportId ? { ...r, status: action === 'dismiss' ? 'dismissed' : 'resolved' } : r))
      );
      toast.success('Report updated');
    } catch (err: any) {
      toast.error('Action failed', err.message);
    }
  };

  // Server-authoritative role check — same trust level as the backend
  // requirePlatformAdmin middleware (JWT role claim verified server-side).
  if (!user || user.role !== 'admin') {
    return (
      <div className="max-w-md mx-auto my-16 p-8 text-center bg-rose-50 border border-rose-200 rounded-3xl space-y-3">
        <Shield className="w-12 h-12 text-rose-600 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-rose-700">
          This portal is reserved for authorized platform administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto pb-16 space-y-6">
      {/* Admin Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Shield className="w-7 h-7 text-rose-600" />
            <span>Kinetix Platform Administration</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Real-time infrastructure metrics, role authorization, content moderation, and category governance.
          </p>
        </div>
      </div>

      {/* Admin Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3 overflow-x-auto no-scrollbar">
        {[
          { id: 'analytics', label: 'Platform Metrics', icon: <BarChart3 className="w-4 h-4" /> },
          { id: 'videos', label: 'Video Management', icon: <Film className="w-4 h-4" /> },
          { id: 'users', label: 'Users & Roles', icon: <Users className="w-4 h-4" /> },
          { id: 'categories', label: 'Categories', icon: <Layers className="w-4 h-4" /> },
          { id: 'moderation', label: 'Moderation Queue', icon: <AlertTriangle className="w-4 h-4" /> }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-slate-200 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* 1. Analytics & Metrics Tab */}
          {activeTab === 'analytics' && metrics && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Videos</span>
                  <p className="text-2xl sm:text-3xl font-black text-slate-900">{metrics.totalVideos}</p>
                </div>

                <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Views</span>
                  <p className="text-2xl sm:text-3xl font-black text-rose-600">{metrics.totalViews.toLocaleString()}</p>
                </div>

                <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Registered Creators</span>
                  <p className="text-2xl sm:text-3xl font-black text-slate-900">{metrics.totalCreators}</p>
                </div>

                <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-1">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pending Reports</span>
                  <p className="text-2xl sm:text-3xl font-black text-amber-600">{metrics.pendingReports}</p>
                </div>
              </div>

              {/* Secondary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <span className="text-xs text-slate-500 font-semibold">Total Likes Registered</span>
                  <p className="text-xl font-bold text-slate-900 mt-1">{metrics.totalLikes.toLocaleString()}</p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <span className="text-xs text-slate-500 font-semibold">Comments & Replies</span>
                  <p className="text-xl font-bold text-slate-900 mt-1">{metrics.totalComments.toLocaleString()}</p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <span className="text-xs text-slate-500 font-semibold">Total Media Ingestion Storage</span>
                  <p className="text-xl font-bold text-slate-900 mt-1">{metrics.totalStorageMB} MB</p>
                </div>
              </div>

              {/* Recent Activity Table */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <div className="p-4 border-b border-slate-100">
                  <h3 className="font-bold text-sm text-slate-900">Recent Platform Ingestions</h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {recentUploads.map((u) => (
                    <div key={u._id} className="p-4 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-slate-900">{u.title}</p>
                        <p className="text-slate-400 mt-0.5">by {u.channelName} • {formatRelativeTime(u.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-semibold rounded uppercase text-[10px]">
                          {u.status}
                        </span>
                        <span className="text-slate-500">{formatViews(u.views)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. Video Management Tab */}
          {activeTab === 'videos' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-900">All Published Media ({videos.length})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase tracking-wider font-bold">
                    <tr>
                      <th className="p-3">Video</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Visibility</th>
                      <th className="p-3">Engagement</th>
                      <th className="p-3">Featured</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {videos.map((v) => (
                      <tr key={v._id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            <img src={v.thumbnailUrl} alt="" className="w-14 aspect-video rounded object-cover bg-slate-100" />
                            <div className="max-w-xs">
                              <p className="font-bold text-slate-900 truncate">{v.title}</p>
                              <p className="text-slate-400 text-[11px] truncate">{v.channel?.name || 'Creator'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">{v.category}</td>
                        <td className="p-3">
                          <select
                            value={v.visibility}
                            onChange={(e) => handleChangeVisibility(v, e.target.value)}
                            className="p-1 border border-slate-200 rounded text-xs bg-white"
                          >
                            <option value="public">Public</option>
                            <option value="unlisted">Unlisted</option>
                            <option value="private">Private</option>
                          </select>
                        </td>
                        <td className="p-3">
                          <span className="text-slate-900">{formatViews(v.views)}</span>
                          <span className="text-slate-400 mx-1">•</span>
                          <span className="text-slate-500">{v.likesCount} likes</span>
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => handleToggleFeatured(v)}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              v.featured
                                ? 'bg-amber-50 border-amber-300 text-amber-600'
                                : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-700'
                            }`}
                            title="Toggle Featured"
                          >
                            <Star className={`w-4 h-4 ${v.featured ? 'fill-amber-500' : ''}`} />
                          </button>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => onSelectVideo(v._id)}
                              className="p-1.5 text-slate-500 hover:text-slate-800 rounded"
                              title="Inspect"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setVideoToDelete(v._id)}
                              className="p-1.5 text-rose-500 hover:text-rose-700 rounded"
                              title="Remove"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. User & Role Management Tab */}
          {activeTab === 'users' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-900">User Accounts & Roles ({usersList.length})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase tracking-wider font-bold">
                    <tr>
                      <th className="p-3">User</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Channel Handle</th>
                      <th className="p-3">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {usersList.map((u) => (
                      <tr key={u._id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 flex items-center gap-2.5">
                          <img src={u.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                          <span className="font-bold text-slate-900">{u.name}</span>
                        </td>
                        <td className="p-3 text-slate-500">{u.email}</td>
                        <td className="p-3">
                          <select
                            value={u.role}
                            onChange={(e) => handleChangeRole(u._id, e.target.value)}
                            className="p-1 border border-slate-200 rounded text-xs bg-white font-semibold"
                          >
                            <option value="user">User</option>
                            <option value="creator">Creator</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(u._id, u.status || 'active')}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase transition-colors ${
                              u.status === 'suspended'
                                ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                                : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            }`}
                          >
                            {u.status === 'suspended' ? 'Suspended' : 'Active'}
                          </button>
                        </td>
                        <td className="p-3 text-slate-400 font-mono">
                          {u.channel?.handle || '—'}
                        </td>
                        <td className="p-3 text-slate-400">
                          {formatRelativeTime(u.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. Category Governance Tab */}
          {activeTab === 'categories' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-900">Platform Categories ({categories.length})</h3>
                <button
                  onClick={() => setIsAddCatOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Category</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {categories.map((c) => (
                  <div key={c._id} className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">{c.name}</h4>
                      <p className="text-xs text-slate-400 mt-0.5">{c.videoCount} videos</p>
                    </div>
                    {c.name !== 'All' && (
                      <button
                        onClick={() => handleDeleteCategory(c._id)}
                        className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                        title="Delete category"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. Moderation Reports Queue Tab */}
          {activeTab === 'moderation' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-900">Moderation Incident Queue ({reports.length})</h3>
              </div>

              {reports.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  Moderation queue is clean. No incident reports pending.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {reports.map((rep) => (
                    <div key={rep._id} className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                      <div className="space-y-1 max-w-lg">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-100 text-rose-700">
                            {rep.reason}
                          </span>
                          <span className="text-xs font-semibold text-slate-700 capitalize">
                            Target: {rep.targetType}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                            rep.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {rep.status}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-900">
                          {rep.targetInfo?.title || rep.targetInfo?.content || 'Target ID: ' + rep.targetId}
                        </p>
                        {rep.notes && (
                          <p className="text-xs text-slate-500 italic">"{rep.notes}"</p>
                        )}
                        <p className="text-[11px] text-slate-400">
                          Reported by {rep.reporterName} • {formatRelativeTime(rep.createdAt)}
                        </p>
                      </div>

                      {rep.status === 'pending' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleModerateReport(rep._id, 'dismiss')}
                            className="px-3 py-1.5 border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-600 transition-colors"
                          >
                            Dismiss
                          </button>
                          <button
                            onClick={() => handleModerateReport(rep._id, 'resolve')}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                          >
                            Mark Reviewed
                          </button>
                          <button
                            onClick={() => handleModerateReport(rep._id, 'delete_target')}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                          >
                            Remove Violating Media
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Delete Video Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(videoToDelete)}
        onClose={() => setVideoToDelete(null)}
        onConfirm={handleDeleteVideo}
        title="Admin Video Removal"
        message="Are you sure you want to permanently delete this video from the platform? This cannot be undone."
        confirmText="Remove Video"
        isDestructive
      />

      {/* Add Category Modal */}
      <Modal
        isOpen={isAddCatOpen}
        onClose={() => setIsAddCatOpen(false)}
        title="Create Category"
      >
        <form onSubmit={handleAddCategory} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Category Name</label>
            <input
              type="text"
              required
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="e.g. Science, Podcasting, Cinema"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:border-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Description (Optional)</label>
            <input
              type="text"
              value={newCatDesc}
              onChange={(e) => setNewCatDesc(e.target.value)}
              placeholder="Brief summary of category focus"
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:border-rose-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddCatOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs"
            >
              Add Category
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
