import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navigation from './components/Navigation';
import Home from './components/Home';
import Login from './components/Login';
import Register from './components/Register';
import Companies from './components/Companies';
import Products from './components/Products';
import ClassCounts from './components/ClassCounts';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import ImageManagerPage from './pages/ImageManagerPage';
import LabelStudioCredentials from './components/LabelStudioCredentials';
import LabelingProjects from './components/LabelingProjects';
import LabelStudioManager from './components/LabelStudioManager';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Navigation />
          <div className="container mt-4">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/companies" element={
                <PrivateRoute>
                  <Companies />
                </PrivateRoute>
              } />
              <Route path="/products" element={
                <PrivateRoute>
                  <Products />
                </PrivateRoute>
              } />
              <Route path="/classcounts" element={
                <PrivateRoute>
                  <ClassCounts />
                </PrivateRoute>
              } />
              <Route path="/images/manage" element={
                <PrivateRoute>
                  <ImageManagerPage />
                </PrivateRoute>
              } />
              <Route path="/label-studio-api-key" element={
                <PrivateRoute>
                  <LabelStudioCredentials />
                </PrivateRoute>
              } />
              <Route path="/labeling-projects" element={
                <PrivateRoute>
                  <LabelingProjects />
                </PrivateRoute>
              } />
              <Route path="/label-studio" element={
                <PrivateRoute>
                  <LabelStudioManager />
                </PrivateRoute>
              } />
            </Routes>
          </div>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
