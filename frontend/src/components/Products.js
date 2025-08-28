import React, { useState, useEffect } from 'react';
import { Container, Table, Button, Form, Modal, Alert, Image } from 'react-bootstrap';
import { getProducts, createProduct, updateProduct, deleteProduct } from '../services/api';
import { getCompanies } from '../services/api';

const Products = () => {
  const [products, setProducts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [currentProduct, setCurrentProduct] = useState({ id: null, name: '', company_id: null, image_url: '' });
  const [formData, setFormData] = useState({ name: '', company_id: '', image_url: '' });

  // Fetch products and companies on component mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    
    // Get products and companies in parallel
    const [productsResponse, companiesResponse] = await Promise.all([
      getProducts(),
      getCompanies()
    ]);
    
    if (productsResponse.success) {
      setProducts(productsResponse.data);
    } else {
      setError('Failed to fetch products: ' + productsResponse.error);
    }
    
    if (companiesResponse.success) {
      setCompanies(companiesResponse.data);
    } else {
      setError(prev => prev + ' Failed to fetch companies: ' + companiesResponse.error);
    }
    
    setLoading(false);
  };

  const handleAddShow = () => {
    setFormData({ name: '', company_id: '', image_url: '' });
    setShowAddModal(true);
  };

  const handleEditShow = (product) => {
    setCurrentProduct(product);
    setFormData({ 
      name: product.name, 
      company_id: product.company_id,
      image_url: product.image_url || ''
    });
    setShowEditModal(true);
  };

  const handleDeleteShow = (product) => {
    setCurrentProduct(product);
    setShowDeleteModal(true);
  };

  const handleClose = () => {
    setShowAddModal(false);
    setShowEditModal(false);
    setShowDeleteModal(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: name === 'company_id' ? parseInt(value, 10) : value
    });
  };

  const handleAdd = async () => {
    if (!formData.name.trim()) {
      setError('Product name is required');
      return;
    }
    
    if (!formData.company_id) {
      setError('Company is required');
      return;
    }
    
    setLoading(true);
    const response = await createProduct(formData);
    
    if (response.success) {
      await fetchData();
      setShowAddModal(false);
      setFormData({ name: '', company_id: '', image_url: '' });
    } else {
      setError('Error adding product: ' + response.error);
    }
    setLoading(false);
  };

  const handleEdit = async () => {
    if (!formData.name.trim()) {
      setError('Product name is required');
      return;
    }
    
    if (!formData.company_id) {
      setError('Company is required');
      return;
    }
    
    setLoading(true);
    const response = await updateProduct(currentProduct.id, formData);
    
    if (response.success) {
      await fetchData();
      setShowEditModal(false);
    } else {
      setError('Error updating product: ' + response.error);
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    setLoading(true);
    const response = await deleteProduct(currentProduct.id);
    
    if (response.success) {
      await fetchData();
      setShowDeleteModal(false);
    } else {
      setError('Error deleting product: ' + response.error);
    }
    setLoading(false);
  };

  // Get company name by ID
  const getCompanyName = (companyId) => {
    const company = companies.find(c => c.id === companyId);
    return company ? company.name : 'Unknown';
  };

  if (loading && products.length === 0) {
    return (
      <Container className="mt-4">
        <div className="text-center">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>Products</h1>
        <Button variant="primary" onClick={handleAddShow}>
          Add Product
        </Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {products.length === 0 ? (
        <Alert variant="info">No products found. Add a new product to get started.</Alert>
      ) : (
        <Table striped bordered hover responsive>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Company</th>
              <th>Image</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>{product.id}</td>
                <td>{product.name}</td>
                <td>{getCompanyName(product.company_id)}</td>
                <td>
                  {product.image_url ? (
                    <Image 
                      src={product.image_url} 
                      alt={product.name}
                      style={{ width: '50px', height: '50px', objectFit: 'cover' }}
                      thumbnail
                    />
                  ) : (
                    'No image'
                  )}
                </td>
                <td>
                  <Button 
                    variant="outline-primary" 
                    size="sm"
                    className="me-2"
                    onClick={() => handleEditShow(product)}
                  >
                    Edit
                  </Button>
                  <Button 
                    variant="outline-danger" 
                    size="sm"
                    onClick={() => handleDeleteShow(product)}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {/* Add Modal */}
      <Modal show={showAddModal} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Add Product</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Product Name</Form.Label>
              <Form.Control
                type="text"
                name="name"
                placeholder="Enter product name"
                value={formData.name}
                onChange={handleChange}
              />
            </Form.Group>
            
            <Form.Group className="mb-3">
              <Form.Label>Company</Form.Label>
              <Form.Select
                name="company_id"
                value={formData.company_id}
                onChange={handleChange}
              >
                <option value="">Select a company</option>
                {companies.map(company => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            
            <Form.Group className="mb-3">
              <Form.Label>Image URL</Form.Label>
              <Form.Control
                type="text"
                name="image_url"
                placeholder="Enter image URL"
                value={formData.image_url}
                onChange={handleChange}
              />
              {formData.image_url && (
                <div className="mt-2">
                  <p>Preview:</p>
                  <Image 
                    src={formData.image_url} 
                    alt="Preview" 
                    style={{ maxWidth: '100%', maxHeight: '200px' }}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://via.placeholder.com/200?text=Invalid+Image';
                    }}
                  />
                </div>
              )}
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleAdd} disabled={loading}>
            {loading ? 'Adding...' : 'Add Product'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Edit Modal */}
      <Modal show={showEditModal} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Edit Product</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Product Name</Form.Label>
              <Form.Control
                type="text"
                name="name"
                placeholder="Enter product name"
                value={formData.name}
                onChange={handleChange}
              />
            </Form.Group>
            
            <Form.Group className="mb-3">
              <Form.Label>Company</Form.Label>
              <Form.Select
                name="company_id"
                value={formData.company_id}
                onChange={handleChange}
              >
                <option value="">Select a company</option>
                {companies.map(company => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            
            <Form.Group className="mb-3">
              <Form.Label>Image URL</Form.Label>
              <Form.Control
                type="text"
                name="image_url"
                placeholder="Enter image URL"
                value={formData.image_url}
                onChange={handleChange}
              />
              {formData.image_url && (
                <div className="mt-2">
                  <p>Preview:</p>
                  <Image 
                    src={formData.image_url} 
                    alt="Preview" 
                    style={{ maxWidth: '100%', maxHeight: '200px' }}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://via.placeholder.com/200?text=Invalid+Image';
                    }}
                  />
                </div>
              )}
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleEdit} disabled={loading}>
            {loading ? 'Updating...' : 'Update Product'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Delete Modal */}
      <Modal show={showDeleteModal} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Delete Product</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete the product "{currentProduct.name}"?
          This action cannot be undone and will delete all related steps.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={loading}>
            {loading ? 'Deleting...' : 'Delete Product'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default Products;
