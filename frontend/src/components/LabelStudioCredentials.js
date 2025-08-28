import React, { useState, useEffect, useContext } from 'react';
import { Form, Button, Alert, Card, Container, Row, Col, Spinner, Badge } from 'react-bootstrap';
import { AuthContext } from '../context/AuthContext';
import axios from 'axios';

function LabelStudioCredentials({ onApiKeyUpdate }) {
  const { auth } = useContext(AuthContext);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);

  useEffect(() => {
    const fetchKeyStatus = async () => {
      try {
        const res = await axios.get(`${process.env.REACT_APP_API_URL}/user/label-studio-api-key`, {
          headers: { Authorization: `Bearer ${auth.token}` },
        });
        setHasKey(res.data.has_key);
      } catch (err) {
        setError('Failed to check API key status.');
      }
    };
    if (auth.isAuthenticated) fetchKeyStatus();
  }, [auth]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await axios.post(
        `${process.env.REACT_APP_API_URL}/user/label-studio-api-key`,
        { api_key: apiKey },
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );
      setSuccess('Legacy Token updated successfully!');
      setApiKey('');
      setHasKey(true);
      // Notify parent component if callback is provided
      if (onApiKeyUpdate) {
        onApiKeyUpdate();
      }
    } catch (error) {
      setError('Failed to update API key.');
    }
    setLoading(false);
  };

  const testConnection = async () => {
    if (!apiKey) {
      setError('Please enter an API key first.');
      return;
    }

    setTestingConnection(true);
    setError('');
    setConnectionStatus(null);

    try {
      const res = await axios.post(
        `${process.env.REACT_APP_API_URL}/label-studio/test-connection`,
        { api_key: apiKey },
        { headers: { Authorization: `Bearer ${auth.token}` } }
      );
      
      setConnectionStatus('success');
      setSuccess('Connection test successful! Your API key is valid.');
    } catch (err) {
      setConnectionStatus('error');
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError('Connection test failed.');
      }
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <Container className="mt-4">
      <Row className="justify-content-center">
        <Col md={8}>
          <Card>
            <Card.Body>
              <Card.Title>Label Studio Legacy Token</Card.Title>
              <Card.Text>
                To integrate with Label Studio, you need to provide your Legacy Token (not Personal Access Token). Follow the instructions above to get your Legacy Token.
              </Card.Text>
              
              {/* Label Studio Legacy Token Instructions */}
              <Alert variant="info" className="mb-3">
                <Alert.Heading>How to Get Your Legacy Token</Alert.Heading>
                <p className="mb-2">
                  <strong>Important:</strong> You need to use a Legacy Token, not a Personal Access Token.
                </p>
                <ol className="mb-2">
                  <li>Go to <a href="http://localhost:8081/user/login" target="_blank" rel="noopener noreferrer">
                    <strong>localhost:8081/user/login</strong>
                  </a> and login or sign up if you don't have an account.</li>
                  <li>Go to your <strong>Organization page</strong> → <strong>Access Token Settings</strong></li>
                  <li><strong>Disable "Personal Access Tokens"</strong> (this is important!)</li>
                  <li>Go to your <strong>User Account page</strong></li>
                  <li>Copy the <strong>Legacy Token</strong> that appears</li>
                </ol>
                <p className="mb-0">
                  <strong>Note:</strong> The Legacy Token should be a long string like <code>9c895bb2fdfa07982e8205addefefa1f2e86aea1</code>
                </p>
              </Alert>
              
              <Form onSubmit={handleSubmit}>
                <Form.Group controlId="apiKey">
                  <Form.Label>Legacy Token</Form.Label>
                  <Form.Control
                    type="password"
                    placeholder={hasKey ? "Legacy token is set. Enter a new one to update." : "Enter your Label Studio Legacy Token"}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    autoComplete="off"
                  />
                </Form.Group>
                
                <div className="d-flex gap-2 mt-3">
                  <Button 
                    variant="outline-primary" 
                    onClick={testConnection} 
                    disabled={testingConnection || !apiKey}
                  >
                    {testingConnection ? (
                      <>
                        <Spinner
                          as="span"
                          animation="border"
                          size="sm"
                          role="status"
                          aria-hidden="true"
                          className="me-1"
                        />
                        Testing...
                      </>
                    ) : (
                      'Test Connection'
                    )}
                  </Button>
                  
                  <Button variant="primary" type="submit" disabled={loading || !apiKey}>
                    {hasKey ? 'Update Legacy Token' : 'Set Legacy Token'}
                  </Button>
                </div>
              </Form>
              
              {connectionStatus === 'success' && (
                <Alert variant="success" className="mt-3">
                  <strong>✓ Connection Successful!</strong> Your API key is valid and working.
                </Alert>
              )}
              
              {success && <Alert variant="success" className="mt-3">{success}</Alert>}
              {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default LabelStudioCredentials;
