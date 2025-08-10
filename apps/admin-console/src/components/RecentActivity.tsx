import {
  Card,
  CardBody,
  Heading,
  VStack,
  HStack,
  Text,
  Badge,
  Box,
  Divider,
} from '@chakra-ui/react';
import useSWR from 'swr';

interface Activity {
  id: string;
  type: 'check_in' | 'check_out' | 'maintenance' | 'rate_change' | 'inventory';
  description: string;
  timestamp: string;
  user: string;
  severity?: 'low' | 'medium' | 'high';
}

export const RecentActivity = () => {
  const { data: activities } = useSWR<Activity[]>('/api/activities/recent');

  const getActivityColor = (type: string, severity?: string) => {
    if (severity) {
      const severityColors = {
        low: 'green',
        medium: 'yellow',
        high: 'red',
      };
      return severityColors[severity as keyof typeof severityColors];
    }

    const typeColors = {
      check_in: 'blue',
      check_out: 'green',
      maintenance: 'orange',
      rate_change: 'purple',
      inventory: 'teal',
    };
    return typeColors[type as keyof typeof typeColors] || 'gray';
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (minutes < 60) {
      return `${minutes}m ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (!activities) {
    return (
      <Card>
        <CardBody>
          <Heading size="md" mb={4}>
            Recent Activity
          </Heading>
          <Text color="gray.500">Loading activities...</Text>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <Heading size="md" mb={4}>
          Recent Activity
        </Heading>
        <VStack spacing={3} align="stretch">
          {activities.slice(0, 8).map((activity, index) => (
            <Box key={activity.id}>
              <HStack justify="space-between" align="start">
                <VStack align="start" spacing={1} flex={1}>
                  <HStack>
                    <Badge
                      colorScheme={getActivityColor(
                        activity.type,
                        activity.severity
                      )}
                      size="sm"
                    >
                      {activity.type.replace('_', ' ')}
                    </Badge>
                    <Text fontSize="xs" color="gray.500">
                      by {activity.user}
                    </Text>
                  </HStack>
                  <Text fontSize="sm">{activity.description}</Text>
                </VStack>
                <Text fontSize="xs" color="gray.500" minW="fit-content">
                  {formatTimestamp(activity.timestamp)}
                </Text>
              </HStack>
              {index < activities.length - 1 && <Divider mt={3} />}
            </Box>
          ))}
        </VStack>
      </CardBody>
    </Card>
  );
};
