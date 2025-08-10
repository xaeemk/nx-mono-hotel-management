import { Box, VStack, HStack, Text, Progress, Flex } from '@chakra-ui/react';
import useSWR from 'swr';
import { RoomStatus } from '../types';

interface RoomStatusData {
  status: RoomStatus;
  count: number;
  percentage: number;
}

export const OccupancyChart = () => {
  const { data: statusData } = useSWR<RoomStatusData[]>(
    '/api/rooms/status-summary'
  );

  const getStatusColor = (status: RoomStatus): string => {
    const colors = {
      [RoomStatus.AVAILABLE]: 'green',
      [RoomStatus.OCCUPIED]: 'blue',
      [RoomStatus.MAINTENANCE]: 'orange',
      [RoomStatus.CLEANING]: 'yellow',
      [RoomStatus.OUT_OF_ORDER]: 'red',
    };
    return colors[status];
  };

  const getStatusLabel = (status: RoomStatus): string => {
    const labels = {
      [RoomStatus.AVAILABLE]: 'Available',
      [RoomStatus.OCCUPIED]: 'Occupied',
      [RoomStatus.MAINTENANCE]: 'Maintenance',
      [RoomStatus.CLEANING]: 'Cleaning',
      [RoomStatus.OUT_OF_ORDER]: 'Out of Order',
    };
    return labels[status];
  };

  if (!statusData) {
    return (
      <Box h="250px" display="flex" alignItems="center" justifyContent="center">
        <Text color="gray.500">Loading room status...</Text>
      </Box>
    );
  }

  return (
    <Box>
      <VStack spacing={4} align="stretch">
        {statusData.map((item) => (
          <Box key={item.status}>
            <Flex justify="space-between" mb={2}>
              <Text fontSize="sm" fontWeight="medium">
                {getStatusLabel(item.status)}
              </Text>
              <Text fontSize="sm" color="gray.600">
                {item.count} ({item.percentage.toFixed(1)}%)
              </Text>
            </Flex>
            <Progress
              value={item.percentage}
              size="sm"
              colorScheme={getStatusColor(item.status)}
              borderRadius="md"
            />
          </Box>
        ))}
      </VStack>
    </Box>
  );
};
