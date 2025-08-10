/// <reference types="cypress" />

declare global {
  namespace Cypress {
    interface Chainable {
      login(email?: string, password?: string): Chainable<void>;
      logout(): Chainable<void>;
      getByTestId(testId: string): Chainable<JQuery<HTMLElement>>;
      waitForPageLoad(): Chainable<void>;
      mockApiResponse(
        method: string,
        url: string,
        response: any,
        statusCode?: number
      ): void;
    }
  }
}

// Login command
Cypress.Commands.add(
  'login',
  (email = 'admin@example.com', password = 'admin123') => {
    cy.session([email, password], () => {
      cy.visit('/login');

      cy.get('[data-testid="email-input"]').type(email);
      cy.get('[data-testid="password-input"]').type(password);
      cy.get('[data-testid="login-button"]').click();

      // Wait for successful login
      cy.url().should('not.include', '/login');
      cy.window()
        .its('localStorage')
        .invoke('getItem', 'access_token')
        .should('exist');
    });
  }
);

// Logout command
Cypress.Commands.add('logout', () => {
  cy.window().then((win) => {
    win.localStorage.removeItem('access_token');
    win.localStorage.removeItem('user');
  });
  cy.visit('/login');
});

// Get element by test ID
Cypress.Commands.add('getByTestId', (testId: string) => {
  return cy.get(`[data-testid="${testId}"]`);
});

// Wait for page to load
Cypress.Commands.add('waitForPageLoad', () => {
  cy.get('[data-testid="loading-spinner"]', { timeout: 1000 }).should(
    'not.exist'
  );
  cy.get('body').should('be.visible');
});

// Mock API response
Cypress.Commands.add(
  'mockApiResponse',
  (method: string, url: string, response: any, statusCode = 200) => {
    cy.intercept(method, url, {
      statusCode,
      body: response,
    });
  }
);

export {};
