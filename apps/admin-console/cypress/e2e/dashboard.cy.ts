describe('Admin Console Dashboard', () => {
  beforeEach(() => {
    cy.login();
    cy.visit('/dashboard');
    cy.waitForPageLoad();
  });

  describe('Dashboard Layout', () => {
    it('should display main dashboard components', () => {
      cy.getByTestId('sidebar').should('be.visible');
      cy.getByTestId('main-content').should('be.visible');
      cy.getByTestId('user-profile').should('be.visible');
      cy.getByTestId('notifications-panel').should('be.visible');
    });

    it('should show navigation menu items', () => {
      cy.getByTestId('nav-dashboard').should('be.visible');
      cy.getByTestId('nav-reservations').should('be.visible');
      cy.getByTestId('nav-rooms').should('be.visible');
      cy.getByTestId('nav-guests').should('be.visible');
      cy.getByTestId('nav-reports').should('be.visible');
      cy.getByTestId('nav-settings').should('be.visible');
    });

    it('should display user information in header', () => {
      cy.getByTestId('user-name').should('contain', 'Admin User');
      cy.getByTestId('user-role').should('contain', 'admin');
    });

    it('should be responsive on mobile devices', () => {
      cy.viewport('iphone-x');

      cy.getByTestId('mobile-menu-button').should('be.visible');
      cy.getByTestId('sidebar').should('not.be.visible');

      cy.getByTestId('mobile-menu-button').click();
      cy.getByTestId('mobile-sidebar').should('be.visible');
    });
  });

  describe('Dashboard Statistics', () => {
    beforeEach(() => {
      cy.mockApiResponse('GET', '**/api/dashboard/stats', {
        totalReservations: 150,
        checkedInGuests: 45,
        availableRooms: 23,
        totalRevenue: 25000,
        occupancyRate: 78.5,
        averageRating: 4.7,
      });
    });

    it('should display key metrics cards', () => {
      cy.getByTestId('metric-total-reservations')
        .should('be.visible')
        .and('contain', '150');

      cy.getByTestId('metric-checked-in-guests')
        .should('be.visible')
        .and('contain', '45');

      cy.getByTestId('metric-available-rooms')
        .should('be.visible')
        .and('contain', '23');

      cy.getByTestId('metric-total-revenue')
        .should('be.visible')
        .and('contain', '$25,000');
    });

    it('should display occupancy rate gauge', () => {
      cy.getByTestId('occupancy-gauge')
        .should('be.visible')
        .and('contain', '78.5%');
    });

    it('should display average rating', () => {
      cy.getByTestId('average-rating')
        .should('be.visible')
        .and('contain', '4.7');
    });

    it('should refresh stats when refresh button is clicked', () => {
      let callCount = 0;
      cy.intercept('GET', '**/api/dashboard/stats', (req) => {
        callCount++;
        req.reply({
          totalReservations: callCount === 1 ? 150 : 155,
          checkedInGuests: 45,
          availableRooms: 23,
          totalRevenue: 25000,
          occupancyRate: 78.5,
          averageRating: 4.7,
        });
      });

      cy.getByTestId('refresh-stats-button').click();

      cy.getByTestId('metric-total-reservations').should('contain', '155');
    });
  });

  describe('Recent Activity', () => {
    beforeEach(() => {
      cy.mockApiResponse('GET', '**/api/dashboard/recent-activity', {
        activities: [
          {
            id: 1,
            type: 'check-in',
            message: 'John Doe checked in to Room 101',
            timestamp: '2024-01-15T10:30:00Z',
            user: 'John Doe',
            room: '101',
          },
          {
            id: 2,
            type: 'reservation',
            message: 'New reservation created by Jane Smith',
            timestamp: '2024-01-15T09:15:00Z',
            user: 'Jane Smith',
            room: '203',
          },
          {
            id: 3,
            type: 'maintenance',
            message: 'Room 105 marked for maintenance',
            timestamp: '2024-01-15T08:45:00Z',
            user: 'Maintenance Team',
            room: '105',
          },
        ],
      });
    });

    it('should display recent activities list', () => {
      cy.getByTestId('recent-activities').should('be.visible');
      cy.getByTestId('activity-item').should('have.length', 3);
    });

    it('should show activity details', () => {
      cy.getByTestId('activity-item')
        .first()
        .within(() => {
          cy.get('[data-testid="activity-message"]').should(
            'contain',
            'John Doe checked in'
          );
          cy.get('[data-testid="activity-timestamp"]').should('be.visible');
          cy.get('[data-testid="activity-type"]').should('contain', 'check-in');
        });
    });

    it('should load more activities when scroll to bottom', () => {
      cy.getByTestId('recent-activities').scrollTo('bottom');

      cy.getByTestId('load-more-activities').should('be.visible').click();

      cy.getByTestId('activity-item').should('have.length.gt', 3);
    });
  });

  describe('Quick Actions', () => {
    it('should display quick action buttons', () => {
      cy.getByTestId('quick-action-new-reservation').should('be.visible');
      cy.getByTestId('quick-action-check-in-guest').should('be.visible');
      cy.getByTestId('quick-action-room-status').should('be.visible');
      cy.getByTestId('quick-action-reports').should('be.visible');
    });

    it('should navigate to new reservation page', () => {
      cy.getByTestId('quick-action-new-reservation').click();

      cy.url().should('include', '/reservations/new');
    });

    it('should open check-in guest modal', () => {
      cy.getByTestId('quick-action-check-in-guest').click();

      cy.getByTestId('check-in-modal').should('be.visible');
      cy.getByTestId('modal-title').should('contain', 'Guest Check-in');
    });

    it('should navigate to room management page', () => {
      cy.getByTestId('quick-action-room-status').click();

      cy.url().should('include', '/rooms');
    });
  });

  describe('Charts and Analytics', () => {
    beforeEach(() => {
      cy.mockApiResponse('GET', '**/api/dashboard/occupancy-chart', {
        data: [
          { date: '2024-01-01', occupancy: 65 },
          { date: '2024-01-02', occupancy: 72 },
          { date: '2024-01-03', occupancy: 68 },
          { date: '2024-01-04', occupancy: 75 },
          { date: '2024-01-05', occupancy: 82 },
        ],
      });

      cy.mockApiResponse('GET', '**/api/dashboard/revenue-chart', {
        data: [
          { month: 'Jan', revenue: 15000 },
          { month: 'Feb', revenue: 18000 },
          { month: 'Mar', revenue: 22000 },
          { month: 'Apr', revenue: 25000 },
        ],
      });
    });

    it('should display occupancy trends chart', () => {
      cy.getByTestId('occupancy-chart').should('be.visible');
      cy.getByTestId('chart-title').should('contain', 'Occupancy Trends');
    });

    it('should display revenue chart', () => {
      cy.getByTestId('revenue-chart').should('be.visible');
      cy.getByTestId('chart-title').should('contain', 'Revenue Overview');
    });

    it('should allow switching chart time periods', () => {
      cy.getByTestId('chart-period-selector').should('be.visible');
      cy.getByTestId('period-7days').should('be.visible');
      cy.getByTestId('period-30days').should('be.visible');
      cy.getByTestId('period-90days').should('be.visible');

      cy.getByTestId('period-30days').click();

      // Chart should update with new data
      cy.wait('@occupancy-chart');
    });
  });

  describe('Notifications', () => {
    beforeEach(() => {
      cy.mockApiResponse('GET', '**/api/notifications', {
        notifications: [
          {
            id: 1,
            type: 'warning',
            title: 'Room Maintenance Required',
            message: 'Room 201 needs immediate attention',
            timestamp: '2024-01-15T11:00:00Z',
            read: false,
          },
          {
            id: 2,
            type: 'info',
            title: 'New Reservation',
            message: 'Reservation #12345 has been created',
            timestamp: '2024-01-15T10:30:00Z',
            read: true,
          },
        ],
      });
    });

    it('should display notification bell icon', () => {
      cy.getByTestId('notification-bell').should('be.visible');
      cy.getByTestId('notification-count').should('contain', '1'); // Unread count
    });

    it('should open notifications panel when bell is clicked', () => {
      cy.getByTestId('notification-bell').click();

      cy.getByTestId('notifications-panel').should('be.visible');
      cy.getByTestId('notification-item').should('have.length', 2);
    });

    it('should mark notification as read when clicked', () => {
      cy.getByTestId('notification-bell').click();
      cy.getByTestId('notification-item').first().click();

      // Mock API call for marking as read
      cy.mockApiResponse('PUT', '**/api/notifications/1/read', {
        success: true,
      });

      cy.getByTestId('notification-count').should('not.exist');
    });

    it('should clear all notifications', () => {
      cy.getByTestId('notification-bell').click();
      cy.getByTestId('clear-all-notifications').click();

      cy.getByTestId('notification-item').should('not.exist');
      cy.getByTestId('no-notifications').should('be.visible');
    });
  });

  describe('Real-time Updates', () => {
    it('should update dashboard data in real-time', () => {
      // Simulate real-time update
      cy.window().then((win) => {
        win.dispatchEvent(
          new CustomEvent('dashboard-update', {
            detail: { totalReservations: 151 },
          })
        );
      });

      cy.getByTestId('metric-total-reservations').should('contain', '151');
    });

    it('should show connection status indicator', () => {
      cy.getByTestId('connection-status').should('be.visible');
      cy.getByTestId('status-indicator').should('have.class', 'connected');
    });
  });

  describe('Error Handling', () => {
    it('should display error message when API fails', () => {
      cy.mockApiResponse(
        'GET',
        '**/api/dashboard/stats',
        {
          message: 'Internal server error',
        },
        500
      );

      cy.visit('/dashboard');

      cy.getByTestId('error-message').should('be.visible');
      cy.getByTestId('retry-button').should('be.visible');
    });

    it('should retry loading data when retry button is clicked', () => {
      cy.mockApiResponse(
        'GET',
        '**/api/dashboard/stats',
        {
          message: 'Internal server error',
        },
        500
      );

      cy.visit('/dashboard');
      cy.getByTestId('retry-button').click();

      // Should make API call again
      cy.wait('@dashboard-stats');
    });

    it('should handle network connectivity issues', () => {
      cy.intercept('GET', '**/api/dashboard/stats', {
        forceNetworkError: true,
      });

      cy.visit('/dashboard');

      cy.getByTestId('network-error').should('be.visible');
      cy.getByTestId('offline-indicator').should('be.visible');
    });
  });
});
