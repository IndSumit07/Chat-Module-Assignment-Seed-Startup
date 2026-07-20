import axiosInstance from './axios.js';

export const getMyConversations   = ()         => axiosInstance.get('/conversations');
export const getConversation      = (id)        => axiosInstance.get(`/conversations/${id}`);
export const createConversation   = (data)      => axiosInstance.post('/conversations', data);
export const updateConversation   = (id, data)  => axiosInstance.patch(`/conversations/${id}`, data);
export const leaveConversation    = (id)        => axiosInstance.delete(`/conversations/${id}/leave`);
export const inviteToConversation = (id, data)  => axiosInstance.post(`/conversations/${id}/invite`, data);
export const getMessages          = (id, params) => axiosInstance.get(`/conversations/${id}/messages`, { params });
export const sendMessage          = (id, data)  => axiosInstance.post(`/conversations/${id}/messages`, data);
export const markConversationRead = (id)        => axiosInstance.post(`/conversations/${id}/read`);
export const deleteConversation   = (id)        => axiosInstance.delete(`/conversations/${id}`);
