import React, { useState, useEffect, useContext, useCallback } from 'react';
import { Container, Row, Col, Card, Button, Alert, Table, Badge, Spinner } from 'react-bootstrap';
import AuthContext from '../context/AuthContext';
import axios from 'axios';

const LabelingProjects = () => {
  const { auth } = useContext(AuthContext);
  const [productSteps, setProductSteps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creatingProject, setCreatingProject] = useState({});
  const [createdProjects, setCreatedProjects] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchProductSteps();
  }, [auth, fetchProductSteps]);

  const fetchProductSteps = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${process.env.REACT_APP_API_URL}/label-studio/product-steps`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      setProductSteps(res.data.product_steps);
    } catch (err) {
      setError('Failed to fetch product steps. Make sure you have products and steps created.');
    } finally {
      setLoading(false);
    }
  }, [auth.token]);

  const createProject = async (productStep) => {
    const key = `${productStep.product_id}-${productStep.step_id}`;
    setCreatingProject(prev => ({ ...prev, [key]: true }));
    setError('');
    setSuccess('');

    try {
      const res = await axios.post(
        `${process.env.REACT_APP_API_URL}/label-studio/create-project`,
        {
          project_name: productStep.project_name,
          labels: productStep.classes
        },
        {
          headers: { Authorization: `Bearer ${auth.token}` }
        }
      );

      setCreatedProjects(prev => ({
        ...prev,
        [key]: {
          project_id: res.data.project_id,
          project_url: res.data.project_url,
          project_name: res.data.project_name
        }
      }));
      
      setSuccess(`Project "${res.data.project_name}" created successfully!`);
    } catch (err) {
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError('Failed to create project. Please check your Label Studio API key.');
      }
    } finally {
      setCreatingProject(prev => ({ ...prev, [key]: false }));
    }
  };

  if (loading) {
    return (
      <Container className="mt-4 text-center">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
        <p>Loading product steps...</p>
      </Container>
    );
  }

  return (
    <Container className="mt-4">
      <Row>
        <Col>
          <Card>
            <Card.Body>
              <Card.Title>Labeling Projects</Card.Title>
              <Card.Text>
                Create Label Studio projects for each product step. Each project will include the classes defined for that step.
              </Card.Text>

              {error && <Alert variant="danger">{error}</Alert>}
              {success && <Alert variant="success">{success}</Alert>}

              {productSteps.length === 0 ? (
                <Alert variant="info">
                  No product steps found. Please create products and steps first before creating labeling projects.
                </Alert>
              ) : (
                <Table responsive striped bordered hover>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Step</th>
                      <th>Classes</th>
                      <th>Project Name</th>
                      <th>Actions</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productSteps.map((ps) => {
                      const key = `${ps.product_id}-${ps.step_id}`;
                      const isCreating = creatingProject[key];
                      const createdProject = createdProjects[key];

                      return (
                        <tr key={key}>
                          <td>{ps.product_name}</td>
                          <td>{ps.step_name}</td>
                          <td>
                            {ps.classes.length > 0 ? (
                              ps.classes.map((className, index) => (
                                <Badge key={index} bg="secondary" className="me-1">
                                  {className}
                                </Badge>
                              ))
                            ) : (
                              <Badge bg="warning">No classes defined</Badge>
                            )}
                          </td>
                          <td><code>{ps.project_name}</code></td>
                          <td>
                            {!createdProject && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => createProject(ps)}
                                disabled={isCreating || !ps.has_classes}
                              >
                                {isCreating ? (
                                  <>
                                    <Spinner
                                      as="span"
                                      animation="border"
                                      size="sm"
                                      role="status"
                                      aria-hidden="true"
                                      className="me-1"
                                    />
                                    Creating...
                                  </>
                                ) : (
                                  'Create Project'
                                )}
                              </Button>
                            )}
                            {!ps.has_classes && (
                              <small className="text-muted d-block">
                                Add classes to this step first
                              </small>
                            )}
                          </td>
                          <td>
                            {createdProject ? (
                              <div>
                                <Badge bg="success" className="mb-1">Created</Badge>
                                <br />
                                <a
                                  href={createdProject.project_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-outline-primary btn-sm"
                                >
                                  Open Project
                                </a>
                              </div>
                            ) : (
                              <Badge bg="secondary">Not Created</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default LabelingProjects;
