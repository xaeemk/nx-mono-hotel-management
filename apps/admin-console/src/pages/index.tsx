import {
  Box,
  Container,
  Grid,
  Heading,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Card,
  CardBody,
  Flex,
  Badge,
  Text,
  SimpleGrid,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Analytics, Room, Inventory } from '../types';
import { useSocket } from '../utils/socket';
import { Layout } from '../components/Layout';
import { RevenueChart } from '../components/RevenueChart';
import { OccupancyChart } from '../components/OccupancyChart';
import { QuickActions } from '../components/QuickActions';
import { RecentActivity } from '../components/RecentActivity';

export default function Dashboard() {
  const { socket, isConnected } = useSocket();
  const [realTimeData, setRealTimeData] = useState<Partial<Analytics>>({});

  // Fetch initial data
  const { data: analytics, mutate: mutateAnalytics } = useSWR<Analytics>(
    '/api/analytics/dashboard'
  );
  const { data: rooms } = useSWR<Room[]>('/api/rooms');
  const { data: lowStockItems } = useSWR<Inventory[]>(
    '/api/inventory/low-stock'
  );

  // Socket listeners for real-time updates
  useEffect(() => {
    if (!socket) return;

    socket.on('analytics:update', (data: Partial<Analytics>) => {
      setRealTimeData(data);
      mutateAnalytics();
    });

    socket.on('room:status:change', () => {
      mutateAnalytics();
    });

    return () => {
      socket.off('analytics:update');
      socket.off('room:status:change');
    };
  }, [socket, mutateAnalytics]);

  const displayAnalytics = { ...analytics, ...realTimeData };

  const getStatusColor = (status: string) => {
    const colors = {
      AVAILABLE: 'green',
      OCCUPIED: 'blue',
      MAINTENANCE: 'orange',
      CLEANING: 'yellow',
      OUT_OF_ORDER: 'red',
    };
    return colors[status as keyof typeof colors] || 'gray';
  };

  if (!analytics) {
    return (
      <Layout>
        <Container maxW="8xl" py={8}>
          <Text>Loading...</Text>
        </Container>
      </Layout>
    );
  }

  return (
    <Layout>
      <Container maxW="8xl" py={8}>
        <Flex justify="space-between" align="center" mb={8}>
          <Heading size="lg">Hotel Management Dashboard</Heading>
          <Badge colorScheme={isConnected ? 'green' : 'red'}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
        </Flex>

        {/* Key Metrics */}
        <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6} mb={8}>
          <Card>
            <CardBody>
              <Stat>
                <StatLabel>Occupancy Rate</StatLabel>
                <StatNumber>
                  {displayAnalytics.occupancyRate?.toFixed(1)}%
                </StatNumber>
                <StatHelpText>
                  {displayAnalytics.availableRooms} /{' '}
                  {displayAnalytics.totalRooms} rooms available
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <Stat>
                <StatLabel>Today's Revenue</StatLabel>
                <StatNumber>
                  ${displayAnalytics.revenue?.toLocaleString()}
                </StatNumber>
                <StatHelpText>
                  Average rate: ${displayAnalytics.averageRate}
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <Stat>
                <StatLabel>Check-ins Today</StatLabel>
                <StatNumber>{displayAnalytics.checkInsToday}</StatNumber>
                <StatHelpText>
                  Check-outs: {displayAnalytics.checkOutsToday}
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <Stat>
                <StatLabel>Maintenance Rooms</StatLabel>
                <StatNumber>{displayAnalytics.maintenanceRooms}</StatNumber>
                <StatHelpText>Requires attention</StatHelpText>
              </Stat>
            </CardBody>
          </Card>
        </SimpleGrid>

        {/* Charts and Analytics */}
        <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={6} mb={8}>
          <Card>
            <CardBody>
              <Heading size="md" mb={4}>
                Revenue Trend
              </Heading>
              <RevenueChart />
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <Heading size="md" mb={4}>
                Room Status
              </Heading>
              <OccupancyChart />
            </CardBody>
          </Card>
        </Grid>

        {/* Quick Actions and Recent Activity */}
        <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={6}>
          <QuickActions />
          <RecentActivity />
        </Grid>

        {/* Low Stock Alert */}
        {lowStockItems && lowStockItems.length > 0 && (
          <Card mt={6}>
            <CardBody>
              <Heading size="md" mb={4} color="orange.500">
                Low Stock Items
              </Heading>
              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                {lowStockItems.map((item) => (
                  <Box key={item.id} p={3} bg="orange.50" borderRadius="md">
                    <Text fontWeight="bold">{item.name}</Text>
                    <Text fontSize="sm" color="gray.600">
                      Stock: {item.currentStock} {item.unit} (Min:{' '}
                      {item.minStock})
                    </Text>
                  </Box>
                ))}
              </SimpleGrid>
            </CardBody>
          </Card>
        )}
      </Container>
    </Layout>
  );
}
