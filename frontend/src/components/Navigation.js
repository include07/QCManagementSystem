import React, { useContext } from 'react';
import { Navbar, Nav, Container, Button } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import AuthContext from '../context/AuthContext';

const Navigation = () => {
  const { auth, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  
  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  
  return (
    <Navbar bg="light" expand="lg" className="navbar-light">
      <Container>
        <Navbar.Brand as={Link} to="/">QC Management System</Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="me-auto">
            <Nav.Link as={Link} to="/">Home</Nav.Link>
            {auth.isAuthenticated && (
              <>
                <Nav.Link as={Link} to="/companies">Companies</Nav.Link>
                <Nav.Link as={Link} to="/products">Products</Nav.Link>
                <Nav.Link as={Link} to="/classcounts">Classes</Nav.Link>
                <Nav.Link as={Link} to="/images/manage">Image Manager</Nav.Link>
                <Nav.Link as={Link} to="/label-studio">Label Studio</Nav.Link>
              </>
            )}
          </Nav>
          <Nav>
            {auth.isAuthenticated ? (
              <>
                <Navbar.Text className="mx-3">
                  Welcome, {auth.user?.username}
                </Navbar.Text>
                <Button variant="outline-danger" onClick={handleLogout}>Logout</Button>
              </>
            ) : (
              <>
                <Nav.Link as={Link} to="/login">Login</Nav.Link>
                <Nav.Link as={Link} to="/register">Register</Nav.Link>
              </>
            )}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default Navigation;
