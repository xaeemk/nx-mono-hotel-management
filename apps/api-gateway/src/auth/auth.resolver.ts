import { Resolver, Mutation, Args, Query, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, AuthResponse, User } from './dto/auth.dto';
import { GqlAuthGuard } from './guards/gql-auth.guard';

@Resolver(() => User)
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Mutation(() => AuthResponse)
  async login(@Args('loginInput') loginDto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(loginDto);
  }

  @Mutation(() => AuthResponse)
  async register(
    @Args('registerInput') registerDto: RegisterDto
  ): Promise<AuthResponse> {
    return this.authService.register(registerDto);
  }

  @Query(() => User)
  @UseGuards(GqlAuthGuard)
  async me(@Context() context): Promise<User> {
    return context.req.user;
  }

  @Mutation(() => User)
  async verifyToken(@Args('token') token: string): Promise<User> {
    return this.authService.verifyToken(token);
  }
}
