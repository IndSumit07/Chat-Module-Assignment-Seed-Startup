import axiosInstance from './axios.js';

export const getMyInvitations    = ()           => axiosInstance.get('/invitations');
export const respondToInvitation = (id, action) => axiosInstance.patch(`/invitations/${id}`, { action });
