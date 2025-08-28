import React, { useState, useEffect } from 'react';
import { Container, Table, Button, Form, Modal, Alert } from 'react-bootstrap';
import { getClassCounts, createClassCount, updateClassCount, deleteClassCount, getProducts } from '../services/api';

const ClassCounts = () => {
  const [classCounts, setClassCounts] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [currentClassCount, setCurrentClassCount] = useState({ id: null, class_: '', product_id: null });
  const [formData, setFormData] = useState({ class: '', product_id: '' });

  // Fetch class counts and products on component mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    
    const [classCountsResponse, productsResponse] = await Promise.all([
      getClassCounts(),
      getProducts()
    ]);
    
    if (classCountsResponse.success) {
      setClassCounts(classCountsResponse.data);
    } else {
      setError('Failed to fetch class counts: ' + classCountsResponse.error);
    }
    
    if (productsResponse.success) {
      setProducts(productsResponse.data);
    } else {
      setError(prev => prev + ' Failed to fetch products: ' + productsResponse.error);
    }
    
    setLoading(false);
  };

  const handleAddShow = () => {
    setFormData({ class: '', product_id: '' });
    setShowAddModal(true);
  };

  const handleEditShow = (classCount) => {
    setCurrentClassCount(classCount);
    setFormData({
      class: classCount.class,
      product_id: classCount.product_id
    });
    setShowEditModal(true);
  };

  const handleDeleteShow = (classCount) => {
    setCurrentClassCount(classCount);
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
      [name]: name === 'product_id' ? parseInt(value, 10) : value
    });
  };

  const handleAdd = async () => {
    if (!formData.class.trim()) {
      setError('Class is required');
      return;
    }
    
    if (!formData.product_id) {
      setError('Product is required');
      return;
    }
    
    setLoading(true);
    const response = await createClassCount(formData);
    
    if (response.success) {
      await fetchData();
      setShowAddModal(false);
      setFormData({ class: '', product_id: '' });
    } else {
      setError('Error adding class: ' + response.error);
    }
    setLoading(false);
  };

  const handleEdit = async () => {
    if (!formData.class.trim()) {
      setError('Class is required');
      return;
    }
    
    if (!formData.product_id) {
      setError('Product is required');
      return;
    }
    
    setLoading(true);
    const response = await updateClassCount(currentClassCount.id, formData);
    
    if (response.success) {
      await fetchData();
      setShowEditModal(false);
    } else {
      setError('Error updating class: ' + response.error);
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    setLoading(true);
    const response = await deleteClassCount(currentClassCount.id);
    
    if (response.success) {
      await fetchData();
      setShowDeleteModal(false);
    } else {
      setError('Error deleting class: ' + response.error);
    }
    setLoading(false);
  };

  // Get product name by ID
  const getProductName = (productId) => {
    const product = products.find(p => p.id === productId);
    return product ? product.name : 'Unknown';
  };

  if (loading && classCounts.length === 0) {
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
        <h1>Classes</h1>
        <Button variant="primary" onClick={handleAddShow}>
          Add Class
        </Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {classCounts.length === 0 ? (
        <Alert variant="info">No classes found. Add a new class to get started.</Alert>
      ) : (
        <Table striped bordered hover>
          <thead>
            <tr>
              <th>ID</th>
              <th>Class</th>
              <th>Product</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {classCounts.map((classCount) => (
              <tr key={classCount.id}>
                <td>{classCount.id}</td>
                <td>{classCount.class}</td>
                <td>{getProductName(classCount.product_id)}</td>
                <td>
                  <Button 
                    variant="outline-primary" 
                    size="sm"
                    className="me-2"
                    onClick={() => handleEditShow(classCount)}
                  >
                    Edit
                  </Button>
                  <Button 
                    variant="outline-danger" 
                    size="sm"
                    onClick={() => handleDeleteShow(classCount)}
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
          <Modal.Title>Add Class Count</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Class</Form.Label>
              <Form.Control
                type="text"
                name="class"
                placeholder="Enter class name"
                value={formData.class}
                onChange={handleChange}
              />
            </Form.Group>
            
            <Form.Group className="mb-3">
              <Form.Label>Product</Form.Label>
              <Form.Select
                name="product_id"
                value={formData.product_id}
                onChange={handleChange}
              >
                <option value="">Select a product</option>
                {products.map(product => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleAdd} disabled={loading}>
            {loading ? 'Adding...' : 'Add Class'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Edit Modal */}
      <Modal show={showEditModal} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Edit Class</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Class</Form.Label>
              <Form.Control
                type="text"
                name="class"
                placeholder="Enter class name"
                value={formData.class}
                onChange={handleChange}
              />
            </Form.Group>
            
            <Form.Group className="mb-3">
              <Form.Label>Product</Form.Label>
              <Form.Select
                name="product_id"
                value={formData.product_id}
                onChange={handleChange}
              >
                <option value="">Select a product</option>
                {products.map(product => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleEdit} disabled={loading}>
            {loading ? 'Updating...' : 'Update Class'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Delete Modal */}
      <Modal show={showDeleteModal} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Delete Class</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete this class?
          This action cannot be undone.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={loading}>
            {loading ? 'Deleting...' : 'Delete Class Count'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default ClassCounts;
