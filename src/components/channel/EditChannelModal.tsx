import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.js';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { apiRequest } from '../../api/client.js';
import { User, AtSign, Image as ImageIcon, FileText, Camera, Upload } from 'lucide-react';

interface EditChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const EditChannelModal: React.FC<EditChannelModalProps> = ({
  isOpen,
  onClose,
  onSaved
}) => {
  const { user, channel, updateProfile } = useAuth();
  const toast = useToast();

  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [avatar, setAvatar] = useState('');
  const [banner, setBanner] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  useEffect(() => {
    if (isOpen && channel) {
      setName(channel.name || user?.name || '');
      setHandle(channel.handle || '');
      setAvatar(channel.avatar || user?.avatar || '');
      setBanner(channel.banner || '');
      setDescription(channel.description || '');
    }
  }, [isOpen, channel, user]);

  const handleFileUpload = async (file: File, type: 'avatar' | 'banner') => {
    const formData = new FormData();
    formData.append('file', file);

    if (type === 'avatar') setIsUploadingAvatar(true);
    else setIsUploadingBanner(true);

    try {
      const res = await apiRequest<{ url: string }>('/api/upload/single', {
        method: 'POST',
        body: formData
      });
      if (type === 'avatar') {
        setAvatar(res.url);
        toast.success('Avatar uploaded successfully');
      } else {
        setBanner(res.url);
        toast.success('Banner uploaded successfully');
      }
    } catch (err: any) {
      toast.error('Upload failed', err.message);
    } finally {
      if (type === 'avatar') setIsUploadingAvatar(false);
      else setIsUploadingBanner(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Validation Error', 'Channel name cannot be empty.');
      return;
    }

    setIsSaving(true);
    try {
      const success = await updateProfile({
        name: name.trim(),
        handle: handle.trim(),
        avatar: avatar.trim(),
        banner: banner.trim(),
        description: description.trim()
      });

      if (success) {
        onClose();
        if (onSaved) onSaved();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Customize Creator Channel" maxWidth="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Banner Preview & Upload */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Channel Banner
          </label>
          <div className="relative h-28 w-full rounded-xl bg-slate-100 overflow-hidden border border-slate-200">
            {banner ? (
              <img src={banner} alt="Banner Preview" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                No banner set
              </div>
            )}
            <label className="absolute right-2 bottom-2 px-3 py-1.5 bg-black/70 hover:bg-black/90 text-white text-xs font-semibold rounded-lg cursor-pointer flex items-center gap-1.5 backdrop-blur-xs transition-colors">
              <Upload className="w-3.5 h-3.5" />
              <span>{isUploadingBanner ? 'Uploading...' : 'Change Banner'}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isUploadingBanner}
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'banner')}
              />
            </label>
          </div>
        </div>

        {/* Avatar Preview & Upload */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <img
              src={avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=user'}
              alt="Avatar Preview"
              className="w-16 h-16 rounded-full object-cover border-2 border-slate-200"
            />
            <label className="absolute bottom-0 right-0 p-1 bg-slate-900 text-white rounded-full cursor-pointer hover:bg-rose-600 transition-colors shadow-xs">
              <Camera className="w-3.5 h-3.5" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isUploadingAvatar}
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'avatar')}
              />
            </label>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Avatar Image
            </label>
            <p className="text-xs text-slate-500">
              Upload a square PNG or JPG image (at least 200x200 px).
            </p>
          </div>
        </div>

        {/* Channel Name */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Channel Name *
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex Studio"
              className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:border-rose-500"
            />
          </div>
        </div>

        {/* Handle */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Channel Handle
          </label>
          <div className="relative">
            <AtSign className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@handle"
              className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:border-rose-500"
            />
          </div>
        </div>

        {/* Bio / Description */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Channel Bio & Description
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tell viewers about your channel and what they will discover..."
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:border-rose-500 resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving Changes...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
