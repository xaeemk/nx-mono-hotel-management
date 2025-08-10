import {
  Box,
  Container,
  Grid,
  Heading,
  Flex,
  Badge,
  Text,
  useDisclosure,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  Room,
  FrontDeskSummary,
  Reservation,
  GuestNotification,
  RoomUpdate,
} from '../types';
import { useSocket } from '../utils/socket';
import { Layout } from '../components/Layout';
import { RoomMapGrid } from '../components/RoomMapGrid';
import { QuickStats } from '../components/QuickStats';
import { TodaysArrivals } from '../components/TodaysArrivals';
import { TodaysDepartures } from '../components/TodaysDepartures';
import { NotificationPanel } from '../components/NotificationPanel';
import { QuickActions } from '../components/QuickActions';

export default function FrontDeskBoard() {
  const { socket, isConnected } = useSocket();
  const [notifications, setNotifications] = useState<GuestNotification[]>([]);
  const [realTimeUpdates, setRealTimeUpdates] = useState<
    Partial<FrontDeskSummary>
  >({});

  // Fetch data with SWR
  const { data: rooms, mutate: mutateRooms } = useSWR<Room[]>('/api/rooms');
  const { data: summary, mutate: mutateSummary } = useSWR<FrontDeskSummary>(
    '/api/frontdesk/summary'
  );
  const { data: arrivals } = useSWR<Reservation[]>(
    '/api/reservations/arrivals/today'
  );
  const { data: departures } = useSWR<Reservation[]>(
    '/api/reservations/departures/today'
  );

  // Socket event listeners for real-time updates
  useEffect(() => {
    if (!socket) return;

    // Room status changes
    socket.on('room:status:update', (update: RoomUpdate) => {
      mutateRooms();
      mutateSummary();

      // Add notification
      const notification: GuestNotification = {
        id: `room-${Date.now()}`,
        type: 'check_in',
        roomNumber: update.roomId,
        guestName: 'System',
        message: `Room ${update.roomId} status changed from ${update.oldStatus} to ${update.newStatus}`,
        priority: 'medium',
        timestamp: update.timestamp,
        read: false,
      };
      setNotifications((prev) => [notification, ...prev.slice(0, 9)]);
    });

    // Guest notifications
    socket.on('guest:notification', (notification: GuestNotification) => {
      setNotifications((prev) => [notification, ...prev.slice(0, 9)]);
    });

    // Summary updates
    socket.on('frontdesk:summary:update', (data: Partial<FrontDeskSummary>) => {
      setRealTimeUpdates(data);
    });

    // Check-in/out events
    socket.on('guest:check-in', () => {
      mutateRooms();
      mutateSummary();
    });

    socket.on('guest:check-out', () => {
      mutateRooms();
      mutateSummary();
    });

    return () => {
      socket.off('room:status:update');
      socket.off('guest:notification');
      socket.off('frontdesk:summary:update');
      socket.off('guest:check-in');
      socket.off('guest:check-out');
    };
  }, [socket, mutateRooms, mutateSummary]);

  const displaySummary = { ...summary, ...realTimeUpdates };

  if (!rooms || !summary) {
    return (
      <Layout>
        <Container maxW="full" py={8}>
          <Text>Loading front desk board...</Text>
        </Container>
      </Layout>
    );
  }

  return (
    <Layout>
      <Container maxW="full" py={6}>
        <Flex justify="space-between" align="center" mb={6}>
          <Heading size="lg" color="frontdesk.700">
            Front Desk Dashboard
          </Heading>
          <Flex align="center" gap={4}>
            <Badge colorScheme={isConnected ? 'green' : 'red'} variant="solid">
              {isConnected ? 'Live Updates' : 'Disconnected'}
            </Badge>
            <Text fontSize="sm" color="gray.600">
              {new Date().toLocaleString()}
            </Text>
          </Flex>
        </Flex>

        {/* Quick Stats Row */}
        <QuickStats summary={displaySummary} mb={6} />

        {/* Main Content Grid */}
        <Grid templateColumns={{ base: '1fr', xl: '1fr 400px' }} gap={6}>
          {/* Left Column - Room Map */}
          <Box>
            <RoomMapGrid rooms={rooms} />
          </Box>

          {/* Right Column - Sidebar */}
          <Flex direction="column" gap={6}>
            <QuickActions />
            <TodaysArrivals arrivals={arrivals} />
            <TodaysDepartures departures={departures} />
            <NotificationPanel notifications={notifications} />
          </Flex>
        </Grid>
      </Container>
    </Layout>
  );
}
