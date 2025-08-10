import {
  Box,
  Flex,
  HStack,
  IconButton,
  VStack,
  Text,
  Avatar,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  useDisclosure,
  useColorModeValue,
} from '@chakra-ui/react';
import { ReactNode } from 'react';
import NextLink from 'next/link';
import { HamburgerIcon } from '@chakra-ui/icons';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const bg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  return (
    <Box minH="100vh">
      {/* Desktop Sidebar */}
      <Box
        display={{ base: 'none', md: 'block' }}
        pos="fixed"
        top={0}
        left={0}
        w="250px"
        h="100vh"
        bg={bg}
        borderRight="1px"
        borderColor={borderColor}
        overflowY="auto"
      >
        <Sidebar />
      </Box>

      {/* Mobile Drawer */}
      <Drawer isOpen={isOpen} placement="left" onClose={onClose}>
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader>Admin Console</DrawerHeader>
          <DrawerBody p={0}>
            <Sidebar onItemClick={onClose} />
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* Main Content */}
      <Box ml={{ base: 0, md: '250px' }}>
        {/* Top Bar */}
        <Flex
          as="header"
          align="center"
          justify="space-between"
          w="full"
          px={4}
          py={3}
          bg={bg}
          borderBottom="1px"
          borderColor={borderColor}
          position="sticky"
          top={0}
          zIndex={10}
        >
          <HStack spacing={4}>
            <IconButton
              display={{ base: 'flex', md: 'none' }}
              onClick={onOpen}
              variant="ghost"
              aria-label="Open menu"
              icon={<HamburgerIcon />}
            />
            <Text fontSize="lg" fontWeight="bold" color="admin.600">
              Hotel Admin Console
            </Text>
          </HStack>

          <Menu>
            <MenuButton>
              <Avatar size="sm" name="Admin User" />
            </MenuButton>
            <MenuList>
              <MenuItem>Profile</MenuItem>
              <MenuItem>Settings</MenuItem>
              <MenuItem>Logout</MenuItem>
            </MenuList>
          </Menu>
        </Flex>

        {/* Page Content */}
        <Box as="main">{children}</Box>
      </Box>
    </Box>
  );
};
