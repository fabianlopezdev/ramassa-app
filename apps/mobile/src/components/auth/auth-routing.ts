export const AUTH_ROUTE_TARGETS = {
  firstTime: '/registration-method',
  returning: '/email-login',
  registeredByEmail: '/email-login',
  registeredByCode: '/access-code-login',
} as const;
