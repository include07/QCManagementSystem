import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { Card, Form, Button, Alert, Table, Badge } from 'react-bootstrap';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';

function ProjectCreator() {
  const { user } = useContext(AuthContext);
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const isCreatingRef = useRef(false);
  const abortControllerRef = useRef(null);
  const isImportingRef = useRef(false);
  const [importingImages, setImportingImages] = useState(false);
  const [importSuccess, setImportSuccess] = useState('');

  useEffect(() => {
    const initializeData = async () => {
      await checkApiKey();
    };
    initializeData();
  }, []);

  useEffect(() => {
    if (hasApiKey) {
      fetchProducts();
    }
  }, [hasApiKey]);

  // Cleanup effect to cancel requests on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await api.get('/label-studio/existing-projects');
      console.log('Fetched products:', response.data);
      setProducts(response.data.products);
    } catch (error) {
      console.error('Error fetching products:', error);
      setError('Failed to fetch products');
    }
  };

  const checkApiKey = async () => {
    try {
      const response = await api.get('/user/label-studio-api-key');
      setHasApiKey(response.data.has_key);
    } catch (error) {
      console.error('Error checking API key:', error);
      setHasApiKey(false);
    }
  };

  const createProject = useCallback(async () => {
    if (!selectedProduct) {
      setError('Please select a product');
      return;
    }

    // Prevent multiple simultaneous requests
    if (loading || isCreatingRef.current) {
      console.log('Request already in progress, skipping...');
      return;
    }

    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();
    isCreatingRef.current = true;
    
    const productId = selectedProduct;
    
    setLoading(true);
    setError('');
    setSuccess('');

    // Generate unique request ID for tracking
    const requestId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    console.log(`[ProjectCreator] Creating project with request ID: ${requestId}`);

    try {
      const response = await api.post('/label-studio/create-project', {
        product_id: parseInt(productId)
      }, {
        signal: abortControllerRef.current.signal,
        headers: {
          'X-Request-ID': requestId
        }
      });

      // Only update state if request wasn't aborted
      if (!abortControllerRef.current.signal.aborted) {
        setSuccess(`Project "${response.data.project.title}" created successfully!`);
        setSelectedProduct('');
        // Refresh the products to update the existing projects list
        await fetchProducts();
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Request was aborted');
        return;
      }
      console.error('Error creating project:', error);
      setError(error.response?.data?.error || 'Failed to create project');
    } finally {
      setLoading(false);
      isCreatingRef.current = false;
      abortControllerRef.current = null;
    }
  }, [selectedProduct]);

  const importImagesForProject = useCallback(async (projectStep) => {
    if (importingImages || isImportingRef.current) {
      console.log('[ProjectCreator] Import already in progress, skipping duplicate call');
      return;
    }

    isImportingRef.current = true;
    setImportingImages(true);
    setError('');
    setImportSuccess('');

    // Generate unique request ID for tracking
    const requestId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    console.log(`[ProjectCreator] Importing images with request ID: ${requestId}`);

    try {
      const response = await api.post('/label-studio/import-images', {
        project_id: projectStep.project_id,
        product_id: projectStep.product_id
      }, {
        headers: {
          'X-Request-ID': requestId
        }
      });

      setImportSuccess(`${response.data.message} for project "${projectStep.project_name}"`);
      // Refresh the project data to update task counts
      await fetchProducts();
    } catch (error) {
      console.error('Error importing images:', error);
      setError(error.response?.data?.error || 'Failed to import images');
    } finally {
      setImportingImages(false);
      isImportingRef.current = false;
    }
  }, [fetchProducts, importingImages]);

  const selectedProductData = products.find(p => 
    p.product_id.toString() === selectedProduct
  );

  if (!hasApiKey) {
    return (
      <Card>
        <Card.Header>
          <h5>Create Label Studio Project</h5>
        </Card.Header>
        <Card.Body>
          <Alert variant="warning">
            <Alert.Heading>Label Studio Legacy Token Required</Alert.Heading>
            <p>
              You need to set up your Label Studio Legacy Token before creating projects.
              Please go to the Label Studio Credentials section first.
            </p>
          </Alert>
        </Card.Body>
      </Card>
    );
  }

  return (
    <div>
      <Card className="mb-4">
        <Card.Header>
          <h5>Create Label Studio Project</h5>
        </Card.Header>
        <Card.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          {success && <Alert variant="success">{success}</Alert>}
          {importSuccess && <Alert variant="success">{importSuccess}</Alert>}

          {/* Project Creation Section - Only show for pairs without existing projects */}
          <div>
            <h6>Create New Projects</h6>
            <p className="text-muted mb-3">
              Select a product that doesn't have an existing Label Studio project.
            </p>
            
            {products.filter(p => !p.has_existing_project && p.has_classes).length > 0 ? (
              <Form>
                <Form.Group className="mb-3">
                  <Form.Label>Select Product (Without Existing Project)</Form.Label>
                  <Form.Select
                    value={selectedProduct}
                    onChange={(e) => setSelectedProduct(e.target.value)}
                    disabled={loading}
                  >
                    <option value="">Choose a product...</option>
                    {products
                      .filter(p => !p.has_existing_project && p.has_classes)
                      .map(p => (
                        <option 
                          key={p.product_id} 
                          value={p.product_id}
                        >
                          {p.project_name} ({p.classes.length} classes)
                        </option>
                      ))}
                  </Form.Select>
                </Form.Group>

                {selectedProductData && (
                  <Card className="mb-3">
                    <Card.Header>
                      <small>Classes for this product:</small>
                    </Card.Header>
                    <Card.Body>
                      {selectedProductData.classes.map((cls, index) => (
                        <Badge key={index} bg="secondary" className="me-2 mb-1">
                          {cls}
                        </Badge>
                      ))}
                    </Card.Body>
                  </Card>
                )}

                <Button 
                  variant="primary" 
                  onClick={createProject}
                  disabled={!selectedProduct || loading}
                  className="w-100"
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Creating Project...
                    </>
                  ) : (
                    'Create Label Studio Project'
                  )}
                </Button>
              </Form>
            ) : (
              <Alert variant="info">
                <h6>No New Projects Available</h6>
                <p className="mb-0">
                  All products with classes either already have Label Studio projects or need classes to be defined first.
                  {products.filter(p => !p.has_classes).length > 0 && 
                    " Some products are missing class definitions."
                  }
                </p>
              </Alert>
            )}
          </div>

          {/* Project Creation Success Message */}
          {success && (
            <Alert variant="success" className="mt-3">
              <h6>Project Created Successfully!</h6>
              <p className="mb-2">
                Your Label Studio project has been created. It should now appear in the "Existing Label Studio Projects" section below where you can import images.
              </p>
              <Button 
                variant="outline-success" 
                size="sm"
                onClick={() => setSuccess('')}
              >
                Create Another Project
              </Button>
            </Alert>
          )}
        </Card.Body>
      </Card>

      {/* Existing Projects Section */}
      {products.filter(p => p.has_existing_project).length > 0 && (
        <Card className="mt-4">
          <Card.Header>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <h6>Existing Label Studio Projects</h6>
                <small className="text-muted">Import images to projects that already exist</small>
              </div>
              <Button 
                variant="outline-secondary" 
                size="sm"
                onClick={fetchProducts}
                disabled={loading}
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </Card.Header>
          <Card.Body>
            <div className="row">
              {products
                .filter(p => p.has_existing_project)
                .map(p => (
                  <div key={p.product_id} className="col-md-6 mb-3">
                    <Card className="h-100">
                      <Card.Header className="d-flex justify-content-between align-items-center">
                        <strong>{p.project_name}</strong>
                        <Badge bg="success">Project #{p.project_id}</Badge>
                      </Card.Header>
                      <Card.Body>
                        <p className="mb-2">
                          <strong>Company:</strong> {p.company_name}<br/>
                          <strong>Tasks:</strong> {p.task_count} total, {p.annotated_count} annotated
                        </p>
                        
                        <div className="mb-3">
                          <small className="text-muted">Classes:</small><br/>
                          {p.classes.map((cls, index) => (
                            <Badge key={index} bg="secondary" className="me-1 mb-1" style={{fontSize: '0.7em'}}>
                              {cls}
                            </Badge>
                          ))}
                        </div>
                        
                        <div className="d-grid gap-2">
                          {p.task_count > 0 ? (
                            <Button 
                              variant="secondary" 
                              size="sm"
                              disabled
                            >
                              Images Already Imported ({p.task_count} tasks)
                            </Button>
                          ) : (
                            <Button 
                              variant="success" 
                              size="sm"
                              onClick={() => importImagesForProject(p)}
                              disabled={importingImages}
                            >
                              {importingImages ? (
                                <>
                                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                  Importing...
                                </>
                              ) : (
                                'Import Images'
                              )}
                            </Button>
                          )}
                          
                          <a 
                            href={p.project_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="btn btn-outline-primary btn-sm"
                          >
                            Open in Label Studio
                          </a>
                        </div>
                      </Card.Body>
                    </Card>
                  </div>
                ))}
            </div>
          </Card.Body>
        </Card>
      )}
    </div>
  );
}export default ProjectCreator;
