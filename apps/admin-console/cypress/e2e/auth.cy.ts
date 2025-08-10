describe('Admin Console Authentication', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  describe('Login Page', () => {
    it('should redirect unauthenticated users to login page', () => {
      cy.url().should('include', '/login');
      cy.getByTestId('login-form').should('be.visible');
    });

    it('should display login form with required fields', () => {
      cy.visit('/login');

      cy.getByTestId('email-input').should('be.visible');
      cy.getByTestId('password-input').should('be.visible');
      cy.getByTestId('login-button').should('be.visible');
      cy.getByTestId('register-link').should('be.visible');
    });

    it('should show validation errors for empty fields', () => {
      cy.visit('/login');

      cy.getByTestId('login-button').click();

      cy.getByTestId('email-error').should('contain', 'Email is required');
      cy.getByTestId('password-error').should(
        'contain',
        'Password is required'
      );
    });

    it('should show validation error for invalid email format', () => {
      cy.visit('/login');

      cy.getByTestId('email-input').type('invalid-email');
      cy.getByTestId('password-input').type('password123');
      cy.getByTestId('login-button').click();

      cy.getByTestId('email-error').should('contain', 'Invalid email format');
    });

    it('should login successfully with valid credentials', () => {
      cy.mockApiResponse('POST', '**/auth/login', {
        access_token: 'mock-token',
        user: {
          id: 1,
          email: 'admin@example.com',
          name: 'Admin User',
          role: 'admin',
        },
        expires_in: '24h',
      });

      cy.visit('/login');

      cy.getByTestId('email-input').type('admin@example.com');
      cy.getByTestId('password-input').type('admin123');
      cy.getByTestId('login-button').click();

      cy.url().should('not.include', '/login');
      cy.getByTestId('dashboard').should('be.visible');
    });

    it('should show error message for invalid credentials', () => {
      cy.mockApiResponse(
        'POST',
        '**/auth/login',
        {
          message: 'Invalid credentials',
        },
        401
      );

      cy.visit('/login');

      cy.getByTestId('email-input').type('admin@example.com');
      cy.getByTestId('password-input').type('wrongpassword');
      cy.getByTestId('login-button').click();

      cy.getByTestId('error-message').should('contain', 'Invalid credentials');
    });

    it('should navigate to registration page', () => {
      cy.visit('/login');

      cy.getByTestId('register-link').click();

      cy.url().should('include', '/register');
      cy.getByTestId('register-form').should('be.visible');
    });
  });

  describe('Registration Page', () => {
    beforeEach(() => {
      cy.visit('/register');
    });

    it('should display registration form with required fields', () => {
      cy.getByTestId('name-input').should('be.visible');
      cy.getByTestId('email-input').should('be.visible');
      cy.getByTestId('password-input').should('be.visible');
      cy.getByTestId('confirm-password-input').should('be.visible');
      cy.getByTestId('register-button').should('be.visible');
      cy.getByTestId('login-link').should('be.visible');
    });

    it('should show validation errors for empty fields', () => {
      cy.getByTestId('register-button').click();

      cy.getByTestId('name-error').should('contain', 'Name is required');
      cy.getByTestId('email-error').should('contain', 'Email is required');
      cy.getByTestId('password-error').should(
        'contain',
        'Password is required'
      );
    });

    it('should validate password confirmation', () => {
      cy.getByTestId('name-input').type('Test User');
      cy.getByTestId('email-input').type('test@example.com');
      cy.getByTestId('password-input').type('password123');
      cy.getByTestId('confirm-password-input').type('different-password');
      cy.getByTestId('register-button').click();

      cy.getByTestId('confirm-password-error').should(
        'contain',
        'Passwords do not match'
      );
    });

    it('should register successfully with valid data', () => {
      cy.mockApiResponse('POST', '**/auth/register', {
        access_token: 'mock-token',
        user: {
          id: 2,
          email: 'test@example.com',
          name: 'Test User',
          role: 'user',
        },
        expires_in: '24h',
      });

      cy.getByTestId('name-input').type('Test User');
      cy.getByTestId('email-input').type('test@example.com');
      cy.getByTestId('password-input').type('password123');
      cy.getByTestId('confirm-password-input').type('password123');
      cy.getByTestId('register-button').click();

      cy.url().should('not.include', '/register');
      cy.getByTestId('dashboard').should('be.visible');
    });

    it('should show error for existing email', () => {
      cy.mockApiResponse(
        'POST',
        '**/auth/register',
        {
          message: 'User with this email already exists',
        },
        409
      );

      cy.getByTestId('name-input').type('Test User');
      cy.getByTestId('email-input').type('admin@example.com');
      cy.getByTestId('password-input').type('password123');
      cy.getByTestId('confirm-password-input').type('password123');
      cy.getByTestId('register-button').click();

      cy.getByTestId('error-message').should(
        'contain',
        'User with this email already exists'
      );
    });
  });

  describe('Logout', () => {
    beforeEach(() => {
      cy.login();
      cy.visit('/dashboard');
    });

    it('should logout user and redirect to login page', () => {
      cy.getByTestId('user-menu').click();
      cy.getByTestId('logout-button').click();

      cy.url().should('include', '/login');
      cy.window()
        .its('localStorage')
        .invoke('getItem', 'access_token')
        .should('be.null');
    });
  });

  describe('Protected Routes', () => {
    it('should redirect unauthenticated users to login', () => {
      cy.visit('/dashboard');
      cy.url().should('include', '/login');
    });

    it('should allow access to authenticated users', () => {
      cy.login();
      cy.visit('/dashboard');

      cy.url().should('include', '/dashboard');
      cy.getByTestId('dashboard').should('be.visible');
    });
  });
});
