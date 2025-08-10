import {
  Card,
  CardBody,
  Heading,
  SimpleGrid,
  Button,
  Icon,
  VStack,
  Text,
  useDisclosure,
} from '@chakra-ui/react';
import { FiPlus, FiEdit, FiSettings, FiDownload } from 'react-icons/fi';
import NextLink from 'next/link';

export const QuickActions = () => {
  const { isOpen, onOpen, onClose } = useDisclosure();

  const actions = [
    {
      title: 'Add New Rate',
      description: 'Create new room rates',
      icon: FiPlus,
      href: '/rates/new',
      colorScheme: 'admin',
    },
    {
      title: 'Update Inventory',
      description: 'Manage stock levels',
      icon: FiEdit,
      href: '/inventory',
      colorScheme: 'blue',
    },
    {
      title: 'Policy Settings',
      description: 'Modify hotel policies',
      icon: FiSettings,
      href: '/policies',
      colorScheme: 'orange',
    },
    {
      title: 'Export Report',
      description: 'Download analytics',
      icon: FiDownload,
      onClick: () => {
        // Trigger report download
        console.log('Downloading report...');
      },
      colorScheme: 'green',
    },
  ];

  return (
    <Card>
      <CardBody>
        <Heading size="md" mb={4}>
          Quick Actions
        </Heading>
        <SimpleGrid columns={2} spacing={3}>
          {actions.map((action) => {
            const ActionButton = (
              <Button
                key={action.title}
                variant="outline"
                colorScheme={action.colorScheme}
                h="auto"
                p={4}
                onClick={action.onClick}
                _hover={{
                  bg: `${action.colorScheme}.50`,
                  borderColor: `${action.colorScheme}.300`,
                }}
              >
                <VStack spacing={2}>
                  <Icon as={action.icon} boxSize={5} />
                  <VStack spacing={1}>
                    <Text fontSize="sm" fontWeight="semibold">
                      {action.title}
                    </Text>
                    <Text fontSize="xs" color="gray.600" textAlign="center">
                      {action.description}
                    </Text>
                  </VStack>
                </VStack>
              </Button>
            );

            if (action.href) {
              return (
                <NextLink key={action.title} href={action.href} passHref>
                  {ActionButton}
                </NextLink>
              );
            }

            return ActionButton;
          })}
        </SimpleGrid>
      </CardBody>
    </Card>
  );
};
