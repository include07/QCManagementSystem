import React, { createContext, useState, useEffect } from 'react';
import jwt_decode from 'jwt-decode';
import axios from 'axios';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState({
    loading: true,
    isAuthenticated: false,
    user: null,
    token: localStorage.getItem('token') || null
  });

  useEffect(() => {
    const loadUser = async () => {
      const token = localStorage.getItem('token');
      
      if (!token) {
        setAuth({
          loading: false,
          isAuthenticated: false,
          user: null,
          token: null
        });
        return;
      }
      
      // Check if token is expired
      try {
        const decoded = jwt_decode(token);
        const currentTime = Date.now() / 1000;
        
        if (decoded.exp < currentTime) {
          // Token expired
          localStorage.removeItem('token');
          setAuth({
            loading: false,
            isAuthenticated: false,
            user: null,
            token: null
          });
          return;
        }
        
        setAuth({
          loading: false,
          isAuthenticated: true,
          user: {
            id: decoded.sub,
            username: localStorage.getItem('username')
          },
          token
        });
      } catch (error) {
        console.error('Error decoding token:', error);
        localStorage.removeItem('token');
        setAuth({
          loading: false,
          isAuthenticated: false,
          user: null,
          token: null
        });
      }
    };
    
    loadUser();
  }, []);

  // Setup axios interceptor for auth headers
  useEffect(() => {
    if (auth.token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${auth.token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [auth.token]);

  const login = async (credentials) => {
    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/login`, credentials);
      
      const { access_token, user_id, username } = res.data;
      
      localStorage.setItem('token', access_token);
      localStorage.setItem('username', username);
      
      setAuth({
        loading: false,
        isAuthenticated: true,
        user: { id: user_id, username },
        token: access_token
      });
      
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { 
        success: false, 
        message: error.response?.data?.message || 'Authentication failed' 
      };
    }
  };

  const register = async (userData) => {
    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/register`, userData);
      return { success: true, message: res.data.message };
    } catch (error) {
      console.error('Registration error:', error);
      return { 
        success: false, 
        message: error.response?.data?.message || 'Registration failed' 
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    
    setAuth({
      loading: false,
      isAuthenticated: false,
      user: null,
      token: null
    });
  };

  return (
    <AuthContext.Provider value={{ auth, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
