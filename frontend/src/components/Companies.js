import React, { useState, useEffect } from 'react';
import { Container, Table, Button, Form, Modal, Alert } from 'react-bootstrap';
import { getCompanies, createCompany, updateCompany, deleteCompany } from '../services/api';

const Companies = () => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [currentCompany, setCurrentCompany] = useState({ id: null, name: '' });
  const [formData, setFormData] = useState({ name: '' });

  // Fetch companies on component mount
  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    setLoading(true);
    setError('');
    const response = await getCompanies();
    
    if (response.success) {
      setCompanies(response.data);
    } else {
      setError('Failed to fetch companies: ' + response.error);
    }
    setLoading(false);
  };

  const handleAddShow = () => {
    setFormData({ name: '' });
    setShowAddModal(true);
  };

  const handleEditShow = (company) => {
    setCurrentCompany(company);
    setFormData({ name: company.name });
    setShowEditModal(true);
  };

  const handleDeleteShow = (company) => {
    setCurrentCompany(company);
    setShowDeleteModal(true);
  };

  const handleClose = () => {
    setShowAddModal(false);
    setShowEditModal(false);
    setShowDeleteModal(false);
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleAdd = async () => {
    if (!formData.name.trim()) {
      setError('Company name is required');
      return;
    }
    
    setLoading(true);
    const response = await createCompany(formData);
    
    if (response.success) {
      await fetchCompanies();
      setShowAddModal(false);
      setFormData({ name: '' });
    } else {
      setError('Error adding company: ' + response.error);
    }
    setLoading(false);
  };

  const handleEdit = async () => {
    if (!formData.name.trim()) {
      setError('Company name is required');
      return;
    }
    
    setLoading(true);
    const response = await updateCompany(currentCompany.id, formData);
    
    if (response.success) {
      await fetchCompanies();
      setShowEditModal(false);
    } else {
      setError('Error updating company: ' + response.error);
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    setLoading(true);
    const response = await deleteCompany(currentCompany.id);
    
    if (response.success) {
      await fetchCompanies();
      setShowDeleteModal(false);
    } else {
      setError('Error deleting company: ' + response.error);
    }
    setLoading(false);
  };

  if (loading && companies.length === 0) {
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
        <h1>Companies</h1>
        <Button variant="primary" onClick={handleAddShow}>
          Add Company
        </Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {companies.length === 0 ? (
        <Alert variant="info">No companies found. Add a new company to get started.</Alert>
      ) : (
        <Table striped bordered hover>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id}>
                <td>{company.id}</td>
                <td>{company.name}</td>
                <td>
                  <Button 
                    variant="outline-primary" 
                    size="sm"
                    className="me-2"
                    onClick={() => handleEditShow(company)}
                  >
                    Edit
                  </Button>
                  <Button 
                    variant="outline-danger" 
                    size="sm"
                    onClick={() => handleDeleteShow(company)}
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
          <Modal.Title>Add Company</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Company Name</Form.Label>
              <Form.Control
                type="text"
                name="name"
                placeholder="Enter company name"
                value={formData.name}
                onChange={handleChange}
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleAdd} disabled={loading}>
            {loading ? 'Adding...' : 'Add Company'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Edit Modal */}
      <Modal show={showEditModal} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Edit Company</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Company Name</Form.Label>
              <Form.Control
                type="text"
                name="name"
                placeholder="Enter company name"
                value={formData.name}
                onChange={handleChange}
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleEdit} disabled={loading}>
            {loading ? 'Updating...' : 'Update Company'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Delete Modal */}
      <Modal show={showDeleteModal} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Delete Company</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete the company "{currentCompany.name}"?
          This action cannot be undone and will delete all related products.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={loading}>
            {loading ? 'Deleting...' : 'Delete Company'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default Companies;
