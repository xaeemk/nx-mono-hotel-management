import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Field, InputType, ObjectType } from '@nestjs/graphql';

@InputType()
export class LoginDto {
  @ApiProperty({
    example: 'admin@example.com',
    description: 'User email address',
  })
  @Field()
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'admin123',
    description: 'User password',
    minLength: 6,
  })
  @Field()
  @IsString()
  @MinLength(6)
  password: string;
}

@InputType()
export class RegisterDto {
  @ApiProperty({ example: 'John Doe', description: 'User full name' })
  @Field()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @ApiProperty({
    example: 'john@example.com',
    description: 'User email address',
  })
  @Field()
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'password123',
    description: 'User password',
    minLength: 6,
  })
  @Field()
  @IsString()
  @MinLength(6)
  password: string;
}

@ObjectType()
export class User {
  @ApiProperty({ example: 1, description: 'User ID' })
  @Field()
  id: number;

  @ApiProperty({ example: 'John Doe', description: 'User full name' })
  @Field()
  name: string;

  @ApiProperty({
    example: 'john@example.com',
    description: 'User email address',
  })
  @Field()
  email: string;

  @ApiProperty({ example: 'user', description: 'User role' })
  @Field()
  role: string;
}

@ObjectType()
export class AuthResponse {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT access token',
  })
  @Field()
  access_token: string;

  @ApiProperty({ type: User, description: 'User information' })
  @Field(() => User)
  user: User;

  @ApiProperty({ example: '24h', description: 'Token expiration time' })
  @Field()
  expires_in: string;
}
