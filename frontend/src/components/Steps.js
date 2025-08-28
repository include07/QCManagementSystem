import React, { useState, useEffect } from 'react';
import { Container, Table, Button, Form, Modal, Alert } from 'react-bootstrap';
import { getSteps, createStep, updateStep, deleteStep, getProducts } from '../services/api';

const Steps = () => {
  const [steps, setSteps] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [currentStep, setCurrentStep] = useState({ id: null, name: '', product_id: null, step_number: 0 });
  const [formData, setFormData] = useState({ name: '', product_id: '', step_number: '' });

  // Function to get available step numbers for a selected product
  const getAvailableStepNumbers = (productId, excludeStepId = null) => {
    if (!productId) return [];
    
    // Get all step numbers already used for this product
    const usedStepNumbers = steps
      .filter(step => step.product_id === parseInt(productId) && step.id !== excludeStepId)
      .map(step => step.step_number);
    
    // Generate array of numbers 1-20 and filter out used ones
    const allStepNumbers = Array.from({ length: 20 }, (_, i) => i + 1);
    return allStepNumbers.filter(num => !usedStepNumbers.includes(num));
  };

  // Fetch steps and products on component mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    
    const [stepsResponse, productsResponse] = await Promise.all([
      getSteps(),
      getProducts()
    ]);
    
    if (stepsResponse.success) {
      setSteps(stepsResponse.data);
    } else {
      setError('Failed to fetch steps: ' + stepsResponse.error);
    }
    
    if (productsResponse.success) {
      setProducts(productsResponse.data);
    } else {
      setError(prev => prev + ' Failed to fetch products: ' + productsResponse.error);
    }
    
    setLoading(false);
  };

  const handleAddShow = () => {
    setFormData({ name: '', product_id: '', step_number: '1' });
    setShowAddModal(true);
  };

  const handleEditShow = (step) => {
    setCurrentStep(step);
    setFormData({
      name: step.name,
      product_id: step.product_id,
      step_number: step.step_number
    });
    setShowEditModal(true);
  };

  const handleDeleteShow = (step) => {
    setCurrentStep(step);
    setShowDeleteModal(true);
  };

  const handleClose = () => {
    setShowAddModal(false);
    setShowEditModal(false);
    setShowDeleteModal(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // If product changes, reset step number to empty
    if (name === 'product_id') {
      setFormData({
        ...formData,
        product_id: parseInt(value, 10),
        step_number: '' // Reset step number when product changes
      });
    } else {
      setFormData({
        ...formData,
        [name]: ['product_id', 'step_number'].includes(name) ? parseInt(value, 10) : value
      });
    }
  };

  const handleAdd = async () => {
    if (!formData.name.trim()) {
      setError('Step name is required');
      return;
    }
    
    if (!formData.product_id) {
      setError('Product is required');
      return;
    }
    
    if (!formData.step_number) {
      setError('Step number is required');
      return;
    }
    
    setLoading(true);
    const response = await createStep(formData);
    
    if (response.success) {
      await fetchData();
      setShowAddModal(false);
      setFormData({ name: '', product_id: '', step_number: '1' });
    } else {
      setError('Error adding step: ' + response.error);
    }
    setLoading(false);
  };

  const handleEdit = async () => {
    if (!formData.name.trim()) {
      setError('Step name is required');
      return;
    }
    
    if (!formData.product_id) {
      setError('Product is required');
      return;
    }
    
    if (!formData.step_number) {
      setError('Step number is required');
      return;
    }
    
    setLoading(true);
    const response = await updateStep(currentStep.id, formData);
    
    if (response.success) {
      await fetchData();
      setShowEditModal(false);
    } else {
      setError('Error updating step: ' + response.error);
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    setLoading(true);
    const response = await deleteStep(currentStep.id);
    
    if (response.success) {
      await fetchData();
      setShowDeleteModal(false);
    } else {
      setError('Error deleting step: ' + response.error);
    }
    setLoading(false);
  };

  // Get product name by ID
  const getProductName = (productId) => {
    const product = products.find(p => p.id === productId);
    return product ? product.name : 'Unknown';
  };

  if (loading && steps.length === 0) {
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
        <h1>Steps</h1>
        <Button variant="primary" onClick={handleAddShow}>
          Add Step
        </Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {steps.length === 0 ? (
        <Alert variant="info">No steps found. Add a new step to get started.</Alert>
      ) : (
        <Table striped bordered hover>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Product</th>
              <th>Step Number</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step) => (
              <tr key={step.id}>
                <td>{step.id}</td>
                <td>{step.name}</td>
                <td>{getProductName(step.product_id)}</td>
                <td>{step.step_number}</td>
                <td>
                  <Button 
                    variant="outline-primary" 
                    size="sm"
                    className="me-2"
                    onClick={() => handleEditShow(step)}
                  >
                    Edit
                  </Button>
                  <Button 
                    variant="outline-danger" 
                    size="sm"
                    onClick={() => handleDeleteShow(step)}
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
          <Modal.Title>Add Step</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Step Name</Form.Label>
              <Form.Control
                type="text"
                name="name"
                placeholder="Enter step name"
                value={formData.name}
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
            
            <Form.Group className="mb-3">
              <Form.Label>Step Number</Form.Label>
              <Form.Select
                name="step_number"
                value={formData.step_number}
                onChange={handleChange}
                disabled={!formData.product_id}
              >
                <option value="">
                  {!formData.product_id ? 'Select a product first' : 'Select step number'}
                </option>
                {getAvailableStepNumbers(formData.product_id).map(stepNum => (
                  <option key={stepNum} value={stepNum}>
                    Step {stepNum}
                  </option>
                ))}
              </Form.Select>
              {formData.product_id && getAvailableStepNumbers(formData.product_id).length === 0 && (
                <Form.Text className="text-danger">
                  All step positions (1-20) are taken for this product
                </Form.Text>
              )}
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleAdd} disabled={loading || (formData.product_id && getAvailableStepNumbers(formData.product_id).length === 0)}>
            {loading ? 'Adding...' : 'Add Step'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Edit Modal */}
      <Modal show={showEditModal} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Edit Step</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Step Name</Form.Label>
              <Form.Control
                type="text"
                name="name"
                placeholder="Enter step name"
                value={formData.name}
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
            
            <Form.Group className="mb-3">
              <Form.Label>Step Number</Form.Label>
              <Form.Select
                name="step_number"
                value={formData.step_number}
                onChange={handleChange}
                disabled={!formData.product_id}
              >
                <option value="">
                  {!formData.product_id ? 'Select a product first' : 'Select step number'}
                </option>
                {getAvailableStepNumbers(formData.product_id, currentStep.id).map(stepNum => (
                  <option key={stepNum} value={stepNum}>
                    Step {stepNum}
                  </option>
                ))}
              </Form.Select>
              {formData.product_id && getAvailableStepNumbers(formData.product_id, currentStep.id).length === 0 && (
                <Form.Text className="text-danger">
                  All step positions (1-20) are taken for this product
                </Form.Text>
              )}
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleEdit} disabled={loading}>
            {loading ? 'Updating...' : 'Update Step'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Delete Modal */}
      <Modal show={showDeleteModal} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Delete Step</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete the step "{currentStep.name}"?
          This action cannot be undone and will delete all related class counts.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={loading}>
            {loading ? 'Deleting...' : 'Delete Step'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default Steps;
