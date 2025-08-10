import {
  Box,
  VStack,
  Text,
  Icon,
  Flex,
  useColorModeValue,
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import NextLink from 'next/link';
import {
  FiHome,
  FiDollarSign,
  FiPackage,
  FiFileText,
  FiUsers,
  FiBarChart,
  FiSettings,
  FiTool,
} from 'react-icons/fi';

interface SidebarProps {
  onItemClick?: () => void;
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: FiHome },
  { name: 'Room Management', href: '/rooms', icon: FiHome },
  { name: 'Rate Management', href: '/rates', icon: FiDollarSign },
  { name: 'Inventory', href: '/inventory', icon: FiPackage },
  { name: 'Policies', href: '/policies', icon: FiFileText },
  { name: 'Staff Management', href: '/staff', icon: FiUsers },
  { name: 'Analytics', href: '/analytics', icon: FiBarChart },
  { name: 'Maintenance', href: '/maintenance', icon: FiTool },
  { name: 'Settings', href: '/settings', icon: FiSettings },
];

export const Sidebar = ({ onItemClick }: SidebarProps) => {
  const router = useRouter();
  const activeBg = useColorModeValue('admin.50', 'admin.900');
  const activeColor = useColorModeValue('admin.700', 'admin.200');
  const hoverBg = useColorModeValue('gray.50', 'gray.700');

  return (
    <Box p={4} h="full">
      <Text fontSize="xl" fontWeight="bold" mb={8} color="admin.600">
        Admin Panel
      </Text>

      <VStack align="stretch" spacing={1}>
        {navigation.map((item) => {
          const isActive = router.pathname === item.href;

          return (
            <NextLink key={item.name} href={item.href} passHref>
              <Box
                as="a"
                display="flex"
                alignItems="center"
                px={3}
                py={2}
                borderRadius="md"
                bg={isActive ? activeBg : 'transparent'}
                color={isActive ? activeColor : 'inherit'}
                _hover={{
                  bg: isActive ? activeBg : hoverBg,
                  textDecoration: 'none',
                }}
                onClick={onItemClick}
              >
                <Icon as={item.icon} mr={3} />
                <Text fontSize="sm" fontWeight={isActive ? '600' : '400'}>
                  {item.name}
                </Text>
              </Box>
            </NextLink>
          );
        })}
      </VStack>
    </Box>
  );
};
