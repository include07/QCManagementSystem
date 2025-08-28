# QC Management System Frontend

This is the frontend application for the QC Management System, built with React.

## Features

- User authentication (login/registration)
- CRUD operations for companies, products, steps, and class counts
- JWT-based authentication
- Form validation
- Responsive UI with Bootstrap

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- npm (v6 or later)
- Backend API running (see main project README)

### Installation

1. Install dependencies:

```bash
npm install
```

2. Set up environment variables by creating a `.env` file:

```
REACT_APP_API_URL=http://localhost:5000
```

### Running the Application

#### Using npm (Development Mode)

To start the development server locally:

```bash
npm start
```

The application will be available at http://localhost:3000.

#### Using Docker Compose

You can also run the entire application stack (frontend, backend, database) using Docker Compose:

```bash
# From the root of the project (not the frontend directory)
docker compose up
```

This will start the frontend on http://localhost:3000.

### Building for Production

To create a production build:

```bash
npm run build
```

The build will be created in the `build` directory.

## Project Structure

- `src/components/`: React components for different views
- `src/context/`: Context API for global state management
- `src/services/`: API service functions for backend communication

## Main Components

- `Login`: User login form
- `Register`: User registration form
- `Companies`: CRUD operations for companies
- `Products`: CRUD operations for products
- `Steps`: CRUD operations for steps
- `ClassCounts`: CRUD operations for class counts

## Authentication

The application uses JWT authentication with tokens stored in local storage. The AuthContext provides authentication state and methods for login, registration, and logout.
