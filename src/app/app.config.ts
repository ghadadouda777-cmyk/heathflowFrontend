import { ApplicationConfig, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { provideRouter } from '@angular/router';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
  HttpInterceptorFn
} from '@angular/common/http';

import { routes } from './app.routes';

// JWT interceptor — browser only
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const platformId = inject(PLATFORM_ID);
  const isBrowser  = isPlatformBrowser(platformId);

  if (req.url.includes('/api/auth/')) return next(req);

  const token = isBrowser ? localStorage.getItem('token') : null;
  if (token) {
    return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
  }
  return next(req);
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(
      withFetch(),
      withInterceptors([jwtInterceptor])
    ),
  ]
};
