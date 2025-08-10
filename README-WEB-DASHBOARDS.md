# Phase 2 Web Dashboards

This document describes the three React/Next.js web applications developed for the hotel management system, featuring real-time updates with WebSockets, modern UI with Chakra UI, and efficient data fetching with SWR.

## Applications Overview

### 1. Admin Console (`apps/admin-console`)

**Port: 3001**

A comprehensive management dashboard for hotel administrators to manage rates, inventory, policies, and overall hotel operations.

#### Features:

- **Dashboard**: Real-time analytics, occupancy rates, revenue tracking
- **Rate Management**: Dynamic pricing, seasonal rates, room type configurations
- **Inventory Management**: Stock tracking, low-stock alerts, supplier management
- **Policy Management**: Check-in/out policies, cancellation rules, pet policies
- **Staff Management**: User roles, permissions, department assignments
- **Analytics**: Revenue charts, occupancy trends, performance metrics
- **Maintenance**: Room maintenance tracking, service requests

#### Key Components:

- `Layout`: Responsive sidebar navigation with mobile support
- `RevenueChart`: Canvas-based line chart for revenue visualization
- `OccupancyChart`: Progress bars showing room status distribution
- `QuickActions`: Fast access to common administrative tasks
- `RecentActivity`: Real-time activity feed

### 2. Front-Desk Board (`apps/front-desk-board`)

**Port: 3002**

A real-time dashboard optimized for front-desk operations, featuring live room maps, check-in/out processes, and billing management.

#### Features:

- **Live Room Map**: Visual room status grid with real-time updates
- **Check-in/Check-out**: Streamlined guest processing workflows
- **Guest Management**: Reservation details, special requests, loyalty levels
- **Billing System**: Service charges, payment processing, invoice generation
- **Arrival/Departure Lists**: Today's expected check-ins and check-outs
- **Real-time Notifications**: Instant updates on room status changes
- **Quick Stats**: Occupancy, revenue, and operational metrics

#### Key Components:

- `RoomMapGrid`: Interactive visual room layout
- `QuickStats`: Real-time operational metrics
- `TodaysArrivals`: Expected guest arrivals with details
- `TodaysDepartures`: Scheduled check-outs and billing
- `NotificationPanel`: Live notification feed

### 3. Housekeeping Mobile PWA (`apps/housekeeping-mobile`)

**Port: 3003**

A mobile-first Progressive Web App for housekeeping staff to manage room cleaning tasks, status updates, and maintenance reports.

#### Features:

- **Task Management**: Room cleaning assignments, priority levels
- **Status Updates**: Room condition reporting, maintenance requests
- **Mobile Optimization**: Touch-friendly interface, offline capability
- **Push Notifications**: New task assignments, priority changes
- **Photo Upload**: Room condition documentation
- **Offline Mode**: Work without internet connection
- **Real-time Sync**: Instant updates across all devices

#### PWA Features:

- Service Worker for offline functionality
- Web App Manifest for mobile installation
- Push notifications for task assignments
- Background sync for status updates

## Technology Stack

### Frontend Framework

- **Next.js 15**: React framework with SSR/SSG capabilities
- **React 19**: Component-based UI library
- **TypeScript**: Type-safe development

### UI & Styling

- **Chakra UI**: Modern, accessible component library
- **Emotion**: CSS-in-JS styling
- **Framer Motion**: Animation library
- **React Icons**: Comprehensive icon set

### Data Management

- **SWR**: Data fetching with caching and revalidation
- **Socket.IO Client**: Real-time WebSocket communication
- **Axios**: HTTP client for API requests

### Development Tools

- **NX Monorepo**: Workspace management and build tools
- **ESLint**: Code linting and style enforcement
- **Prettier**: Code formatting
- **Jest**: Unit testing framework

## Project Structure

```
apps/
├── admin-console/
│   ├── src/
│   │   ├── pages/          # Next.js pages
│   │   ├── components/     # Reusable UI components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── utils/          # Utility functions and theme
│   │   └── types/          # TypeScript type definitions
│   ├── next.config.js      # Next.js configuration
│   └── project.json        # NX project configuration
│
├── front-desk-board/
│   ├── src/
│   │   ├── pages/          # Next.js pages
│   │   ├── components/     # UI components
│   │   ├── utils/          # Utilities and theme
│   │   └── types/          # Type definitions
│   └── next.config.js      # Next.js configuration
│
└── housekeeping-mobile/
    ├── src/
    │   ├── pages/          # Next.js pages
    │   ├── components/     # Mobile-optimized components
    │   ├── utils/          # PWA utilities
    │   └── types/          # Type definitions
    ├── next.config.js      # Next.js + PWA configuration
    └── public/
        └── icons/          # PWA icons
```

## Development Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- Running backend services (API Gateway, microservices)

### Installation

```bash
# Install dependencies
npm install

# Start all web dashboards
npm run web-dashboards:dev

# Or start individual applications
npm run admin-console:dev     # http://localhost:3001
npm run front-desk:dev        # http://localhost:3002
npm run housekeeping:dev      # http://localhost:3003
```

### Building for Production

```bash
# Build all web dashboards
npm run web-dashboards:build

# Or build individually
npm run admin-console:build
npm run front-desk:build
npm run housekeeping:build
```

## Real-time Features

### WebSocket Events

All applications connect to the backend WebSocket server and listen for real-time updates:

#### Admin Console Events:

- `analytics:update` - Dashboard metrics updates
- `room:status:change` - Room status modifications
- `inventory:low-stock` - Stock level alerts

#### Front-Desk Board Events:

- `room:status:update` - Live room status changes
- `guest:notification` - Guest-related alerts
- `guest:check-in` - Check-in events
- `guest:check-out` - Check-out events

#### Housekeeping Mobile Events:

- `housekeeping:task:update` - Task status changes
- `housekeeping:task:assigned` - New task assignments
- `room:status:update` - Room condition updates

### SWR Configuration

Each application uses SWR for efficient data fetching:

```typescript
// Admin Console - Less frequent updates
refreshInterval: 30000;

// Front-Desk Board - More frequent updates
refreshInterval: 5000;

// Housekeeping Mobile - Real-time updates
refreshInterval: 3000;
```

## Theme and Styling

Each application has its own color scheme while maintaining consistency:

- **Admin Console**: Purple theme (`admin` color palette)
- **Front-Desk Board**: Green theme (`frontdesk` color palette)
- **Housekeeping Mobile**: Teal theme (`housekeeping` color palette)

## Mobile Responsiveness

All applications are fully responsive:

- **Admin Console**: Desktop-first with mobile sidebar
- **Front-Desk Board**: Tablet-optimized with mobile support
- **Housekeeping Mobile**: Mobile-first PWA design

## API Integration

Applications integrate with the hotel management API:

### Base URLs

```typescript
// Development
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_SOCKET_URL=ws://localhost:3000

// Production
NEXT_PUBLIC_API_URL=https://api.hotel.com/api
NEXT_PUBLIC_SOCKET_URL=wss://api.hotel.com
```

### Endpoints Used

- `/api/analytics/*` - Dashboard analytics
- `/api/rooms/*` - Room management
- `/api/rates/*` - Rate management
- `/api/inventory/*` - Inventory tracking
- `/api/policies/*` - Policy management
- `/api/reservations/*` - Booking management
- `/api/housekeeping/*` - Housekeeping tasks

## Security Features

- JWT token authentication
- Role-based access control
- CSRF protection
- XSS prevention
- Secure WebSocket connections
- Environment variable protection

## Performance Optimizations

- **Code Splitting**: Automatic route-based splitting
- **Image Optimization**: Next.js Image component
- **Caching**: SWR caching with revalidation
- **Bundle Analysis**: Webpack bundle analyzer
- **PWA Caching**: Service worker for offline content
- **Real-time Updates**: Efficient WebSocket event handling

## Deployment

### Docker Deployment

```dockerfile
# Each application can be containerized
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

### Environment Variables

```env
NEXT_PUBLIC_API_URL=https://api.hotel.com/api
NEXT_PUBLIC_SOCKET_URL=wss://api.hotel.com
NEXT_PUBLIC_APP_NAME=Hotel Management
```

## Testing

```bash
# Run tests for all applications
npm run test

# Run tests for specific application
npx nx test admin-console
npx nx test front-desk-board
npx nx test housekeeping-mobile
```

## Monitoring and Analytics

- Real-time error tracking
- Performance monitoring
- User analytics
- WebSocket connection monitoring
- API response time tracking

## Future Enhancements

1. **Multi-language Support**: i18n internationalization
2. **Dark Mode**: Theme switching capability
3. **Advanced Charts**: Integration with Chart.js or D3.js
4. **Voice Commands**: Speech recognition for mobile app
5. **AR Features**: Augmented reality for room mapping
6. **AI Insights**: Machine learning-based recommendations
7. **Advanced PWA**: Better offline capabilities
8. **Real-time Collaboration**: Multiple user real-time editing

## Contributing

1. Follow the established TypeScript patterns
2. Use Chakra UI components consistently
3. Implement proper error handling
4. Add comprehensive unit tests
5. Follow the existing file structure
6. Document new components and hooks
7. Test real-time functionality thoroughly

## Support

For technical support or questions about the web dashboards:

- Check the API documentation
- Review WebSocket event specifications
- Test with the development environment
- Verify environment variable configuration
