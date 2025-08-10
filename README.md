# Nx Mono-Repo

A complete mono-repository setup using Nx with modern DevOps tooling.

## 🚀 Features

- **Nx Workspace**: Powerful build system and monorepo tools
- **TypeScript**: Full TypeScript support with strict configuration
- **ESLint & Prettier**: Code linting and formatting
- **Husky**: Git hooks for automated quality checks
- **Jest**: Unit testing framework
- **Docker**: Multi-stage Docker setup with compose
- **GitHub Actions**: Complete CI/CD pipeline
- **Git**: Version control with proper ignore patterns

## 📁 Project Structure

```
├── apps/
│   └── web-app/                 # Example React application
├── libs/
│   └── shared/
│       ├── ui/                  # Shared UI components
│       └── utils/               # Shared utilities
├── .github/
│   └── workflows/
│       └── ci.yml              # CI/CD pipeline
├── .husky/                     # Git hooks
├── docker-compose.yml          # Docker services
├── Dockerfile                  # Multi-stage Docker build
├── nx.json                     # Nx workspace configuration
├── package.json                # Dependencies and scripts
└── tsconfig.base.json          # TypeScript configuration
```

## 🛠 Setup Instructions

### Prerequisites

- Node.js (v18 or higher)
- Docker & Docker Compose
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd nx-mono-repo
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Initialize Git hooks**
   ```bash
   npm run prepare
   ```

## 📝 Available Commands

### Development
```bash
npm start                    # Start development server
npm run build               # Build all projects
npm test                    # Run all tests
npm run lint                # Run linting
npm run format              # Format code with Prettier
```

### Docker
```bash
npm run docker:build       # Build Docker images
npm run docker:up          # Start all services
npm run docker:down        # Stop all services
```

### Nx Commands
```bash
nx build <project-name>     # Build specific project
nx test <project-name>      # Test specific project
nx lint <project-name>      # Lint specific project
nx affected:build          # Build affected projects
nx affected:test           # Test affected projects
nx dep-graph               # View dependency graph
```

## 🔧 Adding New Projects

### Create a new React app
```bash
nx generate @nx/react:app my-new-app
```

### Create a new library
```bash
nx generate @nx/react:lib my-new-lib
```

### Create a new Node.js app
```bash
nx generate @nx/node:app my-api
```

## 🐳 Docker Development

The project includes a complete Docker setup:

- **Multi-stage Dockerfile** for optimized production builds
- **Docker Compose** with services:
  - Application (Node.js)
  - PostgreSQL database
  - Redis cache
  - Nginx reverse proxy

Start the development environment:
```bash
docker-compose up -d
```

## 🔄 CI/CD Pipeline

The GitHub Actions pipeline includes:

1. **Code Quality**: ESLint, Prettier, TypeScript checks
2. **Testing**: Jest unit tests with coverage
3. **Building**: Production builds for all projects
4. **Security**: Trivy vulnerability scanning
5. **Docker**: Multi-platform image builds
6. **Deployment**: Automated deployment on main branch

### Required Secrets

Add these secrets in your GitHub repository:

- `DOCKERHUB_USERNAME`: Docker Hub username
- `DOCKERHUB_TOKEN`: Docker Hub access token
- `CODECOV_TOKEN`: Codecov token (optional)

## 🔒 Git Hooks

Pre-configured Husky hooks:

- **pre-commit**: Runs linting and format checking
- **pre-push**: Runs all tests

## 📚 Technologies Used

- **Build System**: Nx
- **Language**: TypeScript
- **Testing**: Jest
- **Linting**: ESLint
- **Formatting**: Prettier
- **Git Hooks**: Husky
- **CI/CD**: GitHub Actions
- **Containerization**: Docker & Docker Compose
- **Databases**: PostgreSQL, Redis

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Run tests: `npm test`
4. Run linting: `npm run lint`
5. Commit your changes (hooks will run automatically)
6. Push and create a Pull Request

## 📄 License

MIT License - see LICENSE file for details.

---

**Happy coding! 🎉**
