import React, { useContext } from 'react';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import AuthContext from '../context/AuthContext';

const Home = () => {
  const { auth } = useContext(AuthContext);

  return (
    <Container className="mt-4">
      <Row className="justify-content-center mb-4">
        <Col md={8}>
          <div className="text-center">
            <h1>Welcome to QC Management System</h1>
            <p className="lead">
              A complete solution for managing quality control processes.
            </p>
            {!auth.isAuthenticated && (
              <div className="mt-4">
                <Button as={Link} to="/login" variant="primary" className="me-3">
                  Login
                </Button>
                <Button as={Link} to="/register" variant="outline-primary">
                  Register
                </Button>
              </div>
            )}
          </div>
        </Col>
      </Row>
      
      {auth.isAuthenticated && (
        <Row className="mt-5">
          <Col md={3} className="mb-4">
            <Card className="h-100">
              <Card.Body>
                <Card.Title>Companies</Card.Title>
                <Card.Text>
                  Manage all your companies in one place.
                </Card.Text>
                <Button as={Link} to="/companies" variant="primary">Go to Companies</Button>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3} className="mb-4">
            <Card className="h-100">
              <Card.Body>
                <Card.Title>Products</Card.Title>
                <Card.Text>
                  View and manage your products inventory.
                </Card.Text>
                <Button as={Link} to="/products" variant="primary">Go to Products</Button>
              </Card.Body>
            </Card>
          </Col>
          <Col md={3} className="mb-4">
            <Card className="h-100">
              <Card.Body>
                <Card.Title>Class Counts</Card.Title>
                <Card.Text>
                  Manage class counts for quality control.
                </Card.Text>
                <Button as={Link} to="/classcounts" variant="primary">Go to Class Counts</Button>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}
    </Container>
  );
};

export default Home;
