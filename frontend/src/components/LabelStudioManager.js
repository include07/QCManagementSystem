import React, { useState, useEffect, useContext } from 'react';
import { Container, Row, Col, Card, Tab, Tabs } from 'react-bootstrap';
import { AuthContext } from '../context/AuthContext';
import LabelStudioCredentials from './LabelStudioCredentials';
import ProjectCreator from './ProjectCreator';
import api from '../services/api';

function LabelStudioManager() {
  const { user } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState('credentials');
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    // Check if user has API key on component mount
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    try {
      const response = await api.get('/user/label-studio-api-key');
      setHasApiKey(response.data.has_key);
      
      // If user has API key, switch to project creation tab
      if (response.data.has_key) {
        setActiveTab('projects');
      }
    } catch (error) {
      console.error('Error checking API key:', error);
      setHasApiKey(false);
    }
  };

  const handleApiKeyUpdate = () => {
    // Re-check API key status
    checkApiKey();
    setActiveTab('projects');
  };

  return (
    <Container className="mt-4">
      <Row>
        <Col>
          <Card>
            <Card.Header>
              <h3>Label Studio Integration</h3>
              <p className="mb-0 text-muted">
                Manage your Label Studio credentials and create annotation projects
              </p>
            </Card.Header>
            <Card.Body>
              <Tabs 
                activeKey={activeTab} 
                onSelect={(k) => setActiveTab(k)}
                className="mb-3"
              >
                <Tab 
                  eventKey="credentials" 
                  title={
                    <span>
                      <i className="fas fa-key me-2"></i>
                      Legacy Token Setup
                      {!hasApiKey && <span className="badge bg-warning ms-2">Required</span>}
                      {hasApiKey && <span className="badge bg-success ms-2">✓</span>}
                    </span>
                  }
                >
                  <LabelStudioCredentials onApiKeyUpdate={handleApiKeyUpdate} />
                </Tab>
                
                <Tab 
                  eventKey="projects" 
                  title={
                    <span>
                      <i className="fas fa-project-diagram me-2"></i>
                      Create Projects
                      {!hasApiKey && <span className="badge bg-secondary ms-2">Disabled</span>}
                    </span>
                  }
                  disabled={!hasApiKey}
                >
                  {hasApiKey ? (
                    <ProjectCreator key={hasApiKey} />
                  ) : (
                    <div className="text-center py-5">
                      <i className="fas fa-lock fa-3x text-muted mb-3"></i>
                      <h5>Legacy Token Required</h5>
                      <p className="text-muted">
                        Please set up your Label Studio Legacy Token first to create projects.
                      </p>
                    </div>
                  )}
                </Tab>
                
                <Tab 
                  eventKey="help" 
                  title={
                    <span>
                      <i className="fas fa-question-circle me-2"></i>
                      Help & Guide
                    </span>
                  }
                >
                  <div className="py-3">
                    <h5>How to Use Label Studio Integration</h5>
                    
                    <Card className="mt-3">
                      <Card.Header>
                        <h6><i className="fas fa-step-forward me-2"></i>Step 1: Get Your Legacy Token</h6>
                      </Card.Header>
                      <Card.Body>
                        <ol>
                          <li>Open Label Studio at <a href="http://localhost:8081" target="_blank" rel="noopener noreferrer">http://localhost:8081</a></li>
                          <li>Log in to your account</li>
                          <li>Go to <strong>Organization</strong> → <strong>Access Token Settings</strong></li>
                          <li>Disable <strong>"Personal Access Tokens"</strong></li>
                          <li>Go to <strong>User Account</strong> → Copy your <strong>Legacy Token</strong></li>
                          <li>Paste the token in the "Legacy Token Setup" tab</li>
                        </ol>
                      </Card.Body>
                    </Card>

                    <Card className="mt-3">
                      <Card.Header>
                        <h6><i className="fas fa-step-forward me-2"></i>Step 2: Create Annotation Projects</h6>
                      </Card.Header>
                      <Card.Body>
                        <ol>
                          <li>Once your Legacy Token is set, go to the "Create Projects" tab</li>
                          <li>Select a product from the dropdown</li>
                          <li>Review the labels that will be created (based on product classes)</li>
                          <li>Click "Create Label Studio Project"</li>
                          <li>Your project will be automatically created with proper labeling configuration</li>
                        </ol>
                      </Card.Body>
                    </Card>

                    <Card className="mt-3">
                      <Card.Header>
                        <h6><i className="fas fa-info-circle me-2"></i>What Happens Automatically</h6>
                      </Card.Header>
                      <Card.Body>
                        <ul>
                          <li><strong>Project Creation:</strong> A new Label Studio project is created with your company and product name</li>
                          <li><strong>Label Configuration:</strong> Product classes become annotation labels automatically</li>
                          <li><strong>UI Setup:</strong> Image annotation interface is configured for quality control</li>
                          <li><strong>Access:</strong> Project is immediately accessible in Label Studio</li>
                        </ul>
                      </Card.Body>
                    </Card>

                    <Card className="mt-3 border-info">
                      <Card.Header className="bg-info text-white">
                        <h6><i className="fas fa-lightbulb me-2"></i>Tips for Success</h6>
                      </Card.Header>
                      <Card.Body>
                        <ul className="mb-0">
                          <li>Make sure Label Studio is running before setting up integration</li>
                          <li>Ensure your product has classes defined before creating projects</li>
                          <li>Each product creates one project with all its classes as labels</li>
                          <li>You can create multiple projects for different products</li>
                          <li>Projects can be managed directly in Label Studio interface</li>
                        </ul>
                      </Card.Body>
                    </Card>
                  </div>
                </Tab>
              </Tabs>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

export default LabelStudioManager;
