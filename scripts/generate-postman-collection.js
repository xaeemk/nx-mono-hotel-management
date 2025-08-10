const fs = require('fs');
const path = require('path');

// Postman collection for API Gateway
const postmanCollection = {
  info: {
    name: 'API Gateway Collection',
    description:
      'Complete API collection for the NestJS API Gateway with REST and GraphQL endpoints',
    version: '1.0.0',
    schema:
      'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: {
    type: 'bearer',
    bearer: {
      token: '{{access_token}}',
    },
  },
  variable: [
    {
      key: 'base_url',
      value: 'http://localhost:3000',
      type: 'string',
    },
    {
      key: 'access_token',
      value: '',
      type: 'string',
    },
  ],
  item: [
    {
      name: 'Health Checks',
      item: [
        {
          name: 'Root Health Check',
          request: {
            method: 'GET',
            header: [],
            url: {
              raw: '{{base_url}}/',
              host: ['{{base_url}}'],
              path: [''],
            },
          },
        },
        {
          name: 'Health Check',
          request: {
            method: 'GET',
            header: [],
            url: {
              raw: '{{base_url}}/health',
              host: ['{{base_url}}'],
              path: ['health'],
            },
          },
        },
        {
          name: 'Readiness Probe',
          request: {
            method: 'GET',
            header: [],
            url: {
              raw: '{{base_url}}/health/ready',
              host: ['{{base_url}}'],
              path: ['health', 'ready'],
            },
          },
        },
        {
          name: 'Liveness Probe',
          request: {
            method: 'GET',
            header: [],
            url: {
              raw: '{{base_url}}/health/live',
              host: ['{{base_url}}'],
              path: ['health', 'live'],
            },
          },
        },
      ],
    },
    {
      name: 'Authentication',
      item: [
        {
          name: 'Login',
          event: [
            {
              listen: 'test',
              script: {
                exec: [
                  'if (pm.response.code === 200) {',
                  '    const response = pm.response.json();',
                  "    pm.collectionVariables.set('access_token', response.access_token);",
                  '}',
                ],
              },
            },
          ],
          request: {
            method: 'POST',
            header: [
              {
                key: 'Content-Type',
                value: 'application/json',
              },
            ],
            body: {
              mode: 'raw',
              raw: '{\n  "email": "admin@example.com",\n  "password": "admin123"\n}',
            },
            url: {
              raw: '{{base_url}}/api/auth/login',
              host: ['{{base_url}}'],
              path: ['api', 'auth', 'login'],
            },
          },
        },
        {
          name: 'Register',
          request: {
            method: 'POST',
            header: [
              {
                key: 'Content-Type',
                value: 'application/json',
              },
            ],
            body: {
              mode: 'raw',
              raw: '{\n  "name": "John Doe",\n  "email": "john@example.com",\n  "password": "password123"\n}',
            },
            url: {
              raw: '{{base_url}}/api/auth/register',
              host: ['{{base_url}}'],
              path: ['api', 'auth', 'register'],
            },
          },
        },
        {
          name: 'Get Profile',
          request: {
            auth: {
              type: 'bearer',
              bearer: {
                token: '{{access_token}}',
              },
            },
            method: 'GET',
            header: [],
            url: {
              raw: '{{base_url}}/api/auth/profile',
              host: ['{{base_url}}'],
              path: ['api', 'auth', 'profile'],
            },
          },
        },
        {
          name: 'Verify Token',
          request: {
            method: 'POST',
            header: [
              {
                key: 'Content-Type',
                value: 'application/json',
              },
            ],
            body: {
              mode: 'raw',
              raw: '{\n  "token": "{{access_token}}"\n}',
            },
            url: {
              raw: '{{base_url}}/api/auth/verify',
              host: ['{{base_url}}'],
              path: ['api', 'auth', 'verify'],
            },
          },
        },
      ],
    },
    {
      name: 'Users',
      item: [
        {
          name: 'Get All Users',
          request: {
            auth: {
              type: 'bearer',
              bearer: {
                token: '{{access_token}}',
              },
            },
            method: 'GET',
            header: [],
            url: {
              raw: '{{base_url}}/api/users',
              host: ['{{base_url}}'],
              path: ['api', 'users'],
            },
          },
        },
        {
          name: 'Get User by ID',
          request: {
            auth: {
              type: 'bearer',
              bearer: {
                token: '{{access_token}}',
              },
            },
            method: 'GET',
            header: [],
            url: {
              raw: '{{base_url}}/api/users/1',
              host: ['{{base_url}}'],
              path: ['api', 'users', '1'],
            },
          },
        },
        {
          name: 'Create User',
          request: {
            auth: {
              type: 'bearer',
              bearer: {
                token: '{{access_token}}',
              },
            },
            method: 'POST',
            header: [
              {
                key: 'Content-Type',
                value: 'application/json',
              },
            ],
            body: {
              mode: 'raw',
              raw: '{\n  "name": "New User",\n  "email": "newuser@example.com",\n  "role": "user"\n}',
            },
            url: {
              raw: '{{base_url}}/api/users',
              host: ['{{base_url}}'],
              path: ['api', 'users'],
            },
          },
        },
        {
          name: 'Update User',
          request: {
            auth: {
              type: 'bearer',
              bearer: {
                token: '{{access_token}}',
              },
            },
            method: 'PUT',
            header: [
              {
                key: 'Content-Type',
                value: 'application/json',
              },
            ],
            body: {
              mode: 'raw',
              raw: '{\n  "name": "Updated User",\n  "role": "admin"\n}',
            },
            url: {
              raw: '{{base_url}}/api/users/1',
              host: ['{{base_url}}'],
              path: ['api', 'users', '1'],
            },
          },
        },
        {
          name: 'Delete User',
          request: {
            auth: {
              type: 'bearer',
              bearer: {
                token: '{{access_token}}',
              },
            },
            method: 'DELETE',
            header: [],
            url: {
              raw: '{{base_url}}/api/users/3',
              host: ['{{base_url}}'],
              path: ['api', 'users', '3'],
            },
          },
        },
      ],
    },
    {
      name: 'GraphQL',
      item: [
        {
          name: 'GraphQL Login',
          event: [
            {
              listen: 'test',
              script: {
                exec: [
                  'if (pm.response.code === 200) {',
                  '    const response = pm.response.json();',
                  '    if (response.data && response.data.login) {',
                  "        pm.collectionVariables.set('access_token', response.data.login.access_token);",
                  '    }',
                  '}',
                ],
              },
            },
          ],
          request: {
            method: 'POST',
            header: [
              {
                key: 'Content-Type',
                value: 'application/json',
              },
            ],
            body: {
              mode: 'raw',
              raw: '{\n  "query": "mutation Login($loginInput: LoginDto!) { login(loginInput: $loginInput) { access_token user { id name email role } expires_in } }",\n  "variables": {\n    "loginInput": {\n      "email": "admin@example.com",\n      "password": "admin123"\n    }\n  }\n}',
            },
            url: {
              raw: '{{base_url}}/graphql',
              host: ['{{base_url}}'],
              path: ['graphql'],
            },
          },
        },
        {
          name: 'GraphQL Register',
          request: {
            method: 'POST',
            header: [
              {
                key: 'Content-Type',
                value: 'application/json',
              },
            ],
            body: {
              mode: 'raw',
              raw: '{\n  "query": "mutation Register($registerInput: RegisterDto!) { register(registerInput: $registerInput) { access_token user { id name email role } expires_in } }",\n  "variables": {\n    "registerInput": {\n      "name": "GraphQL User",\n      "email": "gql@example.com",\n      "password": "password123"\n    }\n  }\n}',
            },
            url: {
              raw: '{{base_url}}/graphql',
              host: ['{{base_url}}'],
              path: ['graphql'],
            },
          },
        },
        {
          name: 'GraphQL Get Profile',
          request: {
            method: 'POST',
            header: [
              {
                key: 'Content-Type',
                value: 'application/json',
              },
              {
                key: 'Authorization',
                value: 'Bearer {{access_token}}',
              },
            ],
            body: {
              mode: 'raw',
              raw: '{\n  "query": "query Me { me { id name email role } }"\n}',
            },
            url: {
              raw: '{{base_url}}/graphql',
              host: ['{{base_url}}'],
              path: ['graphql'],
            },
          },
        },
        {
          name: 'GraphQL Get All Users',
          request: {
            method: 'POST',
            header: [
              {
                key: 'Content-Type',
                value: 'application/json',
              },
              {
                key: 'Authorization',
                value: 'Bearer {{access_token}}',
              },
            ],
            body: {
              mode: 'raw',
              raw: '{\n  "query": "query Users { users { id name email role createdAt } }"\n}',
            },
            url: {
              raw: '{{base_url}}/graphql',
              host: ['{{base_url}}'],
              path: ['graphql'],
            },
          },
        },
        {
          name: 'GraphQL Create User',
          request: {
            method: 'POST',
            header: [
              {
                key: 'Content-Type',
                value: 'application/json',
              },
              {
                key: 'Authorization',
                value: 'Bearer {{access_token}}',
              },
            ],
            body: {
              mode: 'raw',
              raw: '{\n  "query": "mutation CreateUser($input: CreateUserInput!) { createUser(input: $input) { id name email role createdAt } }",\n  "variables": {\n    "input": {\n      "name": "GraphQL Created User",\n      "email": "gqlcreated@example.com",\n      "role": "user"\n    }\n  }\n}',
            },
            url: {
              raw: '{{base_url}}/graphql',
              host: ['{{base_url}}'],
              path: ['graphql'],
            },
          },
        },
      ],
    },
  ],
};

// Generate the collection file
const outputDir = path.join(__dirname, '../docs');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const outputPath = path.join(outputDir, 'api-gateway-postman-collection.json');
fs.writeFileSync(outputPath, JSON.stringify(postmanCollection, null, 2));

console.log('✅ Postman collection generated successfully!');
console.log(`📁 Location: ${outputPath}`);
console.log('\n🚀 To use the collection:');
console.log('1. Open Postman');
console.log('2. Click "Import"');
console.log('3. Select the generated JSON file');
console.log('4. Start the API Gateway server');
console.log('5. Use the "Login" request first to get an access token');
console.log(
  '6. The token will be automatically set for authenticated requests'
);
