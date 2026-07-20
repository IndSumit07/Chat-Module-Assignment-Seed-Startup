import axiosInstance from './axios.js';

export const editMessage   = (id, data) => axiosInstance.patch(`/messages/${id}`, data);
export const deleteMessage = (id)       => axiosInstance.delete(`/messages/${id}`);
