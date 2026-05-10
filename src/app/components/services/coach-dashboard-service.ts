import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';

export interface CoachDashboardOverviewDto {
  totalClients: number;
  activeWorkoutPlans: number;
  totalExercises: number;
  unreadMessages: number;
  subscriptionStatus: string;
  subscriptionRemainingDays: number;
}

export interface CoachWorkoutPlanSummaryDto {
  id: number;
  nom: string;
  description?: string;
  dureeSemaines: number;
  seancesParSemaine: number;
  assignedClientsCount: number;
  exercisesCount: number;
  actif?: boolean;
  dateDebut?: string;
  dateFin?: string;
  coachId?: string;
  exercices?: CoachExerciseDto[];
}

export interface CoachDashboardClientDto {
  id: string;
  name: string;
  email: string;
  assignedPlans: string[];
  progressStatus: string;
}

export interface CoachConversationDto {
  id: number;
  coachId: string;
  clientId: string;
  clientName: string;
  lastMessagePreview: string;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface CoachAnalyticsItemDto {
  label: string;
  value: string;
  trend: string;
  fillPercent: number;
}

export interface CoachExerciseDto {
  id: number;
  nom: string;
  description: string;
  series: number | null;
  repetitions: number | null;
  dureeSecondes: number | null;
  tempsReposSecondes: number | null;
  poidsKg: number | null;
  planExerciceId: number | null;
  coachId?: string;
}

export interface CoachNotificationDto {
  type: string;
  text: string;
}

export interface CoachIdentity {
  coachId?: string;
  coachEmail?: string;
}

@Injectable({
  providedIn: 'root',
})
export class CoachDashboardService {
  private readonly apiUrl = 'http://localhost:8084/api/coach-dashboard';

  constructor(
    private readonly http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  getOverview(identity: CoachIdentity): Observable<CoachDashboardOverviewDto> {
    return this.http.get<CoachDashboardOverviewDto>(`${this.apiUrl}/overview`, {
      params: this.toParams(identity),
      headers: this.authHeaders(),
    });
  }

  getWorkoutPlans(identity: CoachIdentity): Observable<CoachWorkoutPlanSummaryDto[]> {
    return this.http.get<CoachWorkoutPlanSummaryDto[]>(`${this.apiUrl}/workout-plans`, {
      params: this.toParams(identity),
      headers: this.authHeaders(),
    });
  }

  getClients(identity: CoachIdentity): Observable<CoachDashboardClientDto[]> {
    return this.http.get<CoachDashboardClientDto[]>(`${this.apiUrl}/clients`, {
      params: this.toParams(identity),
      headers: this.authHeaders(),
    });
  }

  getExercises(coachId?: string): Observable<CoachExerciseDto[]> {
    const params: any = {};
    if (coachId) params['coachId'] = coachId;
    return this.http.get<CoachExerciseDto[]>('http://localhost:8084/api/exercices', {
      params,
      headers: this.authHeaders(),
    });
  }

  getExercisesByPlan(planId: number): Observable<CoachExerciseDto[]> {
    return this.http.get<CoachExerciseDto[]>(`http://localhost:8084/api/exercices/plan/${planId}`, {
      headers: this.authHeaders(),
    });
  }

  createExercise(exercise: Omit<CoachExerciseDto, 'id'>): Observable<CoachExerciseDto> {
    return this.http.post<CoachExerciseDto>('http://localhost:8084/api/exercices', exercise, {
      headers: this.authHeaders(),
    });
  }

  updateExercise(id: number, exercise: Omit<CoachExerciseDto, 'id'>): Observable<CoachExerciseDto> {
    return this.http.put<CoachExerciseDto>(`http://localhost:8084/api/exercices/${id}`, exercise, {
      headers: this.authHeaders(),
    });
  }

  deleteExercise(id: number): Observable<void> {
    return this.http.delete<void>(`http://localhost:8084/api/exercices/${id}`, {
      headers: this.authHeaders(),
    });
  }

  getExerciseById(id: number): Observable<CoachExerciseDto> {
    return this.http.get<CoachExerciseDto>(`http://localhost:8084/api/exercices/${id}`, {
      headers: this.authHeaders(),
    });
  }

  getConversations(identity: CoachIdentity): Observable<CoachConversationDto[]> {
    return this.http.get<CoachConversationDto[]>(`${this.apiUrl}/conversations`, {
      params: this.toParams(identity),
      headers: this.authHeaders(),
    });
  }

  getAnalytics(identity: CoachIdentity): Observable<CoachAnalyticsItemDto[]> {
    return this.http.get<CoachAnalyticsItemDto[]>(`${this.apiUrl}/analytics`, {
      params: this.toParams(identity),
      headers: this.authHeaders(),
    });
  }

  // Plan CRUD methods
  createPlan(plan: Omit<CoachWorkoutPlanSummaryDto, 'id' | 'assignedClientsCount'>): Observable<CoachWorkoutPlanSummaryDto> {
    return this.http.post<CoachWorkoutPlanSummaryDto>('http://localhost:8084/api/plans-exercices', plan, {
      headers: this.authHeaders(),
    });
  }

  updatePlan(id: number, plan: Omit<CoachWorkoutPlanSummaryDto, 'id' | 'assignedClientsCount'>): Observable<CoachWorkoutPlanSummaryDto> {
    return this.http.put<CoachWorkoutPlanSummaryDto>(`http://localhost:8084/api/plans-exercices/${id}`, plan, {
      headers: this.authHeaders(),
    });
  }

  deletePlan(id: number): Observable<void> {
    return this.http.delete<void>(`http://localhost:8084/api/plans-exercices/${id}`, {
      headers: this.authHeaders(),
    });
  }

  getPlanById(id: number): Observable<CoachWorkoutPlanSummaryDto> {
    return this.http.get<CoachWorkoutPlanSummaryDto>(`http://localhost:8084/api/plans-exercices/${id}`, {
      headers: this.authHeaders(),
    });
  }

  getNotifications(identity: CoachIdentity): Observable<CoachNotificationDto[]> {
    return this.http.get<CoachNotificationDto[]>(`${this.apiUrl}/notifications`, {
      params: this.toParams(identity),
      headers: this.authHeaders(),
    });
  }

  assignPlanToClient(dto: { coachId: string; clientId: string; planExerciceId: number }): Observable<any> {
    return this.http.post(`${this.apiUrl}/assignments`, dto, {
      headers: this.authHeaders(),
    });
  }

  private toParams(identity: CoachIdentity): Record<string, string> {
    const params: Record<string, string> = {};
    if (identity.coachId) {
      params['coachId'] = identity.coachId;
    }
    if (identity.coachEmail) {
      params['coachEmail'] = identity.coachEmail;
    }
    return params;
  }

  private authHeaders(): HttpHeaders {
    if (isPlatformBrowser(this.platformId)) {
      const token = localStorage.getItem('token') ?? sessionStorage.getItem('token');
      if (!token) {
        console.log('CoachDashboardService - No token found in storage');
        return new HttpHeaders();
      }
      console.log('CoachDashboardService - Using token:', token.substring(0, 20) + '...');
      return new HttpHeaders({
        Authorization: `Bearer ${token}`,
      });
    }
    console.log('CoachDashboardService - Not in browser environment, no auth headers');
    return new HttpHeaders();
  }
}
