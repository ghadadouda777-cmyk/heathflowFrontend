import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Routes with URL parameters — rendered on-demand by the server
  { path: 'conversation/:patientId',   renderMode: RenderMode.Server },
  { path: 'dashboard/bloomer/:userId', renderMode: RenderMode.Server },
  { path: 'dashboard/patient/:userId', renderMode: RenderMode.Server },
  { path: 'authentification/:role',    renderMode: RenderMode.Server },

  // All other routes — client-side rendering (avoids prerender issues)
  { path: '**',                        renderMode: RenderMode.Client },
];
