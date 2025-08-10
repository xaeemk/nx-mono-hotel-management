import { configureTestingModule } from '@nestjs/testing';

// Increase timeout for API tests
jest.setTimeout(30000);

// Setup global test configuration
beforeAll(async () => {
  // Any global setup that needs to happen before all tests
  console.log('Setting up API test environment...');
});

afterAll(async () => {
  // Cleanup after all tests
  console.log('Cleaning up API test environment...');
});

// Mock external dependencies
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue(true),
  })),
}));

jest.mock('twilio', () => ({
  Twilio: jest.fn(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({ sid: 'mock-sms-sid' }),
    },
  })),
}));

// Global test utilities
global.testHelpers = {
  createMockUser: (overrides = {}) => ({
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    role: 'user',
    ...overrides,
  }),

  createMockReservation: (overrides = {}) => ({
    id: 'reservation-123',
    status: 'CONFIRMED',
    checkInDate: new Date('2024-01-15T15:00:00Z'),
    checkOutDate: new Date('2024-01-20T11:00:00Z'),
    guestId: 'guest-456',
    roomId: 'room-101',
    ...overrides,
  }),
};

declare global {
  namespace NodeJS {
    interface Global {
      testHelpers: {
        createMockUser: (overrides?: any) => any;
        createMockReservation: (overrides?: any) => any;
      };
    }
  }
}
