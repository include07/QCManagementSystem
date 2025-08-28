import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL;

// Company APIs
export const getCompanies = async () => {
  try {
    const response = await axios.get(`${API_URL}/companies`);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error fetching companies:', error);
    return { success: false, error: error.response?.data?.message || 'Failed to fetch companies' };
  }
};

export const createCompany = async (company) => {
  try {
    const response = await axios.post(`${API_URL}/companies`, company);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error creating company:', error);
    return { success: false, error: error.response?.data?.message || 'Failed to create company' };
  }
};

export const updateCompany = async (id, company) => {
  try {
    const response = await axios.put(`${API_URL}/companies/${id}`, company);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error updating company:', error);
    return { success: false, error: error.response?.data?.message || 'Failed to update company' };
  }
};

export const deleteCompany = async (id) => {
  try {
    await axios.delete(`${API_URL}/companies/${id}`);
    return { success: true };
  } catch (error) {
    console.error('Error deleting company:', error);
    return { success: false, error: error.response?.data?.message || 'Failed to delete company' };
  }
};

// Product APIs
export const getProducts = async () => {
  try {
    const response = await axios.get(`${API_URL}/products`);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error fetching products:', error);
    return { success: false, error: error.response?.data?.message || 'Failed to fetch products' };
  }
};

export const createProduct = async (product) => {
  try {
    const response = await axios.post(`${API_URL}/products`, product);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error creating product:', error);
    return { success: false, error: error.response?.data?.message || 'Failed to create product' };
  }
};

export const updateProduct = async (id, product) => {
  try {
    const response = await axios.put(`${API_URL}/products/${id}`, product);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error updating product:', error);
    return { success: false, error: error.response?.data?.message || 'Failed to update product' };
  }
};

export const deleteProduct = async (id) => {
  try {
    await axios.delete(`${API_URL}/products/${id}`);
    return { success: true };
  } catch (error) {
    console.error('Error deleting product:', error);
    return { success: false, error: error.response?.data?.message || 'Failed to delete product' };
  }
};

// Class APIs
export const getClassCounts = async () => {
  try {
    const response = await axios.get(`${API_URL}/classcounts`);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error fetching classes:', error);
    return { success: false, error: error.response?.data?.message || 'Failed to fetch classes' };
  }
};

export const createClassCount = async (classCount) => {
  try {
    const response = await axios.post(`${API_URL}/classcounts`, classCount);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error creating class:', error);
    return { success: false, error: error.response?.data?.message || 'Failed to create class' };
  }
};

export const updateClassCount = async (id, classCount) => {
  try {
    const response = await axios.put(`${API_URL}/classcounts/${id}`, classCount);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error updating class:', error);
    return { success: false, error: error.response?.data?.message || 'Failed to update class' };
  }
};

export const deleteClassCount = async (id) => {
  try {
    await axios.delete(`${API_URL}/classcounts/${id}`);
    return { success: true };
  } catch (error) {
    console.error('Error deleting class:', error);
    return { success: false, error: error.response?.data?.message || 'Failed to delete class' };
  }
};

// Image Download APIs
export const downloadAllImages = async () => {
  try {
    const token = localStorage.getItem('token');
    const response = await axios.get(`${API_URL}/download/images/all`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      responseType: 'blob' // Important for file downloads
    });
    
    // Create a download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    
    // Extract filename from Content-Disposition header or use default
    const contentDisposition = response.headers['content-disposition'];
    let filename = 'all_images.zip';
    if (contentDisposition) {
      const matches = contentDisposition.match(/filename="?([^"]+)"?/);
      if (matches && matches[1]) {
        filename = matches[1];
      }
    }
    
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    return { success: true, message: 'Download started' };
  } catch (error) {
    console.error('Error downloading all images:', error);
    return { success: false, error: error.response?.data?.message || 'Failed to download images' };
  }
};

// Create axios instance for direct API calls
const api = axios.create({
  baseURL: API_URL,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
