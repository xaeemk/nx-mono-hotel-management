import { Injectable } from '@nestjs/common';

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
}

// Mock users data
const mockUsers: User[] = [
  {
    id: 1,
    name: 'Admin User',
    email: 'admin@example.com',
    role: 'admin',
    createdAt: new Date('2024-01-01'),
  },
  {
    id: 2,
    name: 'Regular User',
    email: 'user@example.com',
    role: 'user',
    createdAt: new Date('2024-01-15'),
  },
  {
    id: 3,
    name: 'John Doe',
    email: 'john@example.com',
    role: 'user',
    createdAt: new Date('2024-02-01'),
  },
];

@Injectable()
export class UsersService {
  async findAll(): Promise<User[]> {
    return mockUsers;
  }

  async findOne(id: number): Promise<User | null> {
    return mockUsers.find((user) => user.id === id) || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return mockUsers.find((user) => user.email === email) || null;
  }

  async create(userData: Partial<User>): Promise<User> {
    const newUser: User = {
      id: Math.max(...mockUsers.map((u) => u.id)) + 1,
      name: userData.name!,
      email: userData.email!,
      role: userData.role || 'user',
      createdAt: new Date(),
    };

    mockUsers.push(newUser);
    return newUser;
  }

  async update(id: number, userData: Partial<User>): Promise<User | null> {
    const userIndex = mockUsers.findIndex((user) => user.id === id);
    if (userIndex === -1) return null;

    mockUsers[userIndex] = { ...mockUsers[userIndex], ...userData };
    return mockUsers[userIndex];
  }

  async delete(id: number): Promise<boolean> {
    const userIndex = mockUsers.findIndex((user) => user.id === id);
    if (userIndex === -1) return false;

    mockUsers.splice(userIndex, 1);
    return true;
  }
}
