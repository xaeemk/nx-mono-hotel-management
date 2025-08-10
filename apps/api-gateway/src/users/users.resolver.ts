import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards, NotFoundException } from '@nestjs/common';
import { Field, ObjectType, InputType, ID } from '@nestjs/graphql';
import { UsersService, User as UserInterface } from './users.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';

@ObjectType()
class User {
  @Field(() => ID)
  id: number;

  @Field()
  name: string;

  @Field()
  email: string;

  @Field()
  role: string;

  @Field()
  createdAt: Date;
}

@InputType()
class CreateUserInput {
  @Field()
  name: string;

  @Field()
  email: string;

  @Field({ nullable: true })
  role?: string;
}

@InputType()
class UpdateUserInput {
  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  email?: string;

  @Field({ nullable: true })
  role?: string;
}

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query(() => [User])
  @UseGuards(GqlAuthGuard)
  async users(): Promise<UserInterface[]> {
    return this.usersService.findAll();
  }

  @Query(() => User)
  @UseGuards(GqlAuthGuard)
  async user(
    @Args('id', { type: () => Int }) id: number
  ): Promise<UserInterface> {
    const user = await this.usersService.findOne(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  @Mutation(() => User)
  @UseGuards(GqlAuthGuard)
  async createUser(
    @Args('input') input: CreateUserInput
  ): Promise<UserInterface> {
    return this.usersService.create(input);
  }

  @Mutation(() => User)
  @UseGuards(GqlAuthGuard)
  async updateUser(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateUserInput
  ): Promise<UserInterface> {
    const user = await this.usersService.update(id, input);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async deleteUser(
    @Args('id', { type: () => Int }) id: number
  ): Promise<boolean> {
    return this.usersService.delete(id);
  }
}
