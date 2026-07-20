import axiosInstance from './axios.js';

/**
 * Uploads one or more files to the backend.
 * 
 * @param {File[]} files 
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export const uploadFiles = (files) => {
  const formData = new FormData();
  Array.from(files).forEach((file) => {
    formData.append('files', file);
  });

  return axiosInstance.post('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};
