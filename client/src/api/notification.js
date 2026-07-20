import axiosInstance from './axios.js';

export const getMyNotifications = (params) => axiosInstance.get('/notifications', { params });
export const markRead           = (id)      => axiosInstance.patch(`/notifications/${id}/read`);
export const markAllRead        = ()        => axiosInstance.patch('/notifications/read-all');
