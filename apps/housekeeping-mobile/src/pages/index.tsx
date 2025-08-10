import {
  Box,
  Container,
  VStack,
  Heading,
  Flex,
  Badge,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Room, HousekeepingTask, HousekeepingAssignment } from '../types';
import { useSocket } from '../utils/socket';
import { MobileLayout } from '../components/MobileLayout';
import { QuickStats } from '../components/QuickStats';
import { TaskList } from '../components/TaskList';
import { RoomCard } from '../components/RoomCard';
import { StatusUpdateModal } from '../components/StatusUpdateModal';

export default function HousekeepingMobile() {
  const { socket, isConnected } = useSocket();
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [realTimeUpdates, setRealTimeUpdates] = useState<{
    [key: string]: any;
  }>({});

  const bg = useColorModeValue('gray.50', 'gray.900');

  // Get current housekeeping staff ID (would come from auth)
  const staffId = 'current-staff-id'; // This would be from authentication context

  // Fetch data
  const { data: assignments, mutate: mutateAssignments } = useSWR<
    HousekeepingAssignment[]
  >(`/api/housekeeping/assignments/${staffId}`);
  const { data: tasks, mutate: mutateTasks } = useSWR<HousekeepingTask[]>(
    `/api/housekeeping/tasks/${staffId}`
  );

  // Socket listeners for real-time updates
  useEffect(() => {
    if (!socket) return;

    socket.emit('join-room', `housekeeping-${staffId}`);

    // Task updates
    socket.on('housekeeping:task:update', (data) => {
      mutateTasks();
      mutateAssignments();
    });

    // New task assignment
    socket.on('housekeeping:task:assigned', (data) => {
      mutateTasks();
      mutateAssignments();

      // Show push notification if supported
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('New Task Assigned', {
          body: `Room ${data.roomNumber}: ${data.taskType}`,
          icon: '/icons/icon-192x192.png',
        });
      }
    });

    // Room status changes from other sources
    socket.on('room:status:update', (update) => {
      mutateAssignments();
    });

    return () => {
      socket.off('housekeeping:task:update');
      socket.off('housekeeping:task:assigned');
      socket.off('room:status:update');
    };
  }, [socket, staffId, mutateTasks, mutateAssignments]);

  // Request notification permission on load
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  if (!assignments || !tasks) {
    return (
      <MobileLayout>
        <Container maxW="md" py={4}>
          <Text>Loading housekeeping dashboard...</Text>
        </Container>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <Box bg={bg} minH="100vh">
        <Container maxW="md" py={4}>
          {/* Header */}
          <Flex justify="space-between" align="center" mb={6}>
            <VStack align="start" spacing={1}>
              <Heading size="lg" color="green.700">
                Housekeeping
              </Heading>
              <Text fontSize="sm" color="gray.600">
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
            </VStack>
            <Badge colorScheme={isConnected ? 'green' : 'red'} variant="solid">
              {isConnected ? 'Online' : 'Offline'}
            </Badge>
          </Flex>

          {/* Quick Stats */}
          <QuickStats
            totalTasks={tasks.length}
            completedTasks={
              tasks.filter((t) => t.status === 'completed').length
            }
            pendingTasks={tasks.filter((t) => t.status === 'pending').length}
            inProgressTasks={
              tasks.filter((t) => t.status === 'in_progress').length
            }
            mb={6}
          />

          {/* Task List */}
          <TaskList
            tasks={tasks}
            onTaskUpdate={mutateTasks}
            onRoomSelect={setSelectedRoom}
          />

          {/* Status Update Modal */}
          {selectedRoom && (
            <StatusUpdateModal
              room={selectedRoom}
              isOpen={!!selectedRoom}
              onClose={() => setSelectedRoom(null)}
              onUpdate={() => {
                mutateTasks();
                mutateAssignments();
                setSelectedRoom(null);
              }}
            />
          )}
        </Container>
      </Box>
    </MobileLayout>
  );
}
