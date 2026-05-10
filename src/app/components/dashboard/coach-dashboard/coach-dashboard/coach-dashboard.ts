import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import {
  CoachAnalyticsItemDto,
  CoachConversationDto,
  CoachDashboardClientDto,
  CoachDashboardOverviewDto,
  CoachDashboardService,
  CoachExerciseDto,
  CoachIdentity,
  CoachNotificationDto,
  CoachWorkoutPlanSummaryDto,
} from '../../../services/coach-dashboard-service';
import { RendezVousService } from '../../../services/rendez-vous';
import { RendezVous } from '../../../../interfaces/rendez-vous';
import { ChatComponent } from '../../../chat/chat.component';

type SubscriptionState = 'Active' | 'Expired';

interface SidebarItem {
  label: string;
  icon: string;
  active?: boolean;
  badgeCount?: number;
}

interface OverviewCard {
  label: string;
  value: string;
  helper: string;
  accent: 'green' | 'blue' | 'purple' | 'orange' | 'neutral';
}

interface WorkoutPlanItem {
  id: number;
  nom: string;
  dureeSemaines: number;
  seancesParSemaine: number;
  assignedClientsCount: number;
  exercisesCount: number;
}

interface ExerciseItem {
  id: number;
  nom: string;
  categorie: string;
  description: string;
  series?: number;
  repetitions?: number;
  poidsKg?: number;
}

interface ClientItem {
  id: string;
  name: string;
  email: string;
  assignedPlans: string[];
  progressStatus: string;
}

interface ConversationItem {
  id: number;
  clientName: string;
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
}

interface AnalyticsItem {
  label: string;
  value: string;
  trend: string;
  fillPercent: number;
}

interface NotificationItem {
  id: number;
  text: string;
  type: string;
}

@Component({
  selector: 'app-coach-dashboard',
  imports: [CommonModule, DatePipe, FormsModule, ChatComponent],
  templateUrl: './coach-dashboard.html',
  styleUrl: './coach-dashboard.css',
})
export class CoachDashboard implements OnInit {
  coachName = 'Coach';
  get coachRole(): string {
    return this.coachProfile?.coachSpecialite || 'Coach';
  }
  readonly searchPlaceholder = 'Search clients, plans, exercises...';
  readonly apiErrorDefault = 'Error loading dashboard data.';

  subscription = {
    currentPlan: '3 months Pro',
    status: 'Active' as SubscriptionState,
    remainingDays: 42,
    expirationDate: '2026-06-12',
  };

  readonly sidebarItems: SidebarItem[] = [
    { label: 'Dashboard', icon: '🏠' },
    { label: 'Clients', icon: '🧑‍🤝‍🧑' },
    { label: 'Workout Plans', icon: '📋' },
    { label: 'Exercises', icon: '🏋️' },
    { label: 'Conversations', icon: '💬' },
    { label: 'Subscription', icon: '💳' },
    { label: 'Profile', icon: '👤' },
  ];

  activeTab: string = 'Dashboard';

  workoutPlans: WorkoutPlanItem[] = [];
  exercises: ExerciseItem[] = [];
  clients: ClientItem[] = [];
  conversations: ConversationItem[] = [];
  analytics: AnalyticsItem[] = [];
  notifications: NotificationItem[] = [];
  isLoading = false;
  apiError = '';

  // ── SEARCH ────────────────────────────────────────────────────────────────
  searchQuery = '';

  get filteredWorkoutPlans(): WorkoutPlanItem[] {
    if (!this.searchQuery.trim()) return this.workoutPlans;
    const q = this.searchQuery.toLowerCase();
    return this.workoutPlans.filter(p => p.nom.toLowerCase().includes(q));
  }

  get filteredExercises(): ExerciseItem[] {
    if (!this.searchQuery.trim()) return this.exercises;
    const q = this.searchQuery.toLowerCase();
    return this.exercises.filter(e =>
      e.nom.toLowerCase().includes(q) || e.categorie.toLowerCase().includes(q)
    );
  }

  get filteredClients(): ClientItem[] {
    if (!this.searchQuery.trim()) return this.clientsWithConfirmedRdv;
    const q = this.searchQuery.toLowerCase();
    return this.clientsWithConfirmedRdv.filter(c =>
      c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
  }

  onSearch(query: string): void {
    if (!query.trim()) return;
    // Auto-navigate to the most relevant tab
    const q = query.toLowerCase();
    const hasClient  = this.clientsWithConfirmedRdv.some(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
    const hasPlan    = this.workoutPlans.some(p => p.nom.toLowerCase().includes(q));
    const hasExercise = this.exercises.some(e => e.nom.toLowerCase().includes(q) || e.categorie.toLowerCase().includes(q));

    if (hasClient)   { this.activeTab = 'Clients'; return; }
    if (hasPlan)     { this.activeTab = 'Workout Plans'; return; }
    if (hasExercise) { this.activeTab = 'Exercises'; return; }
  }

  // Modal states
  showExerciseModal = false;
  showPlanModal = false;
  showClientDetailsModal = false;
  showPlanViewModal = false;
  showAssignmentModal = false;
  isEditingExercise = false;
  isEditingPlan = false;
  assignmentContext: 'client' | 'plan' = 'client';
  
  currentExercise: ExerciseItem | null = null;
  currentPlan: WorkoutPlanItem | null = null;
  selectedClient: ClientItem | null = null;
  selectedPlan: CoachWorkoutPlanSummaryDto | null = null;
  
  // Assignment selections
  targetAssignmentId: string | null = null; // Client ID or Plan ID (string for client UUID, number for plan)
  targetAssignmentPlanId: number | null = null; // Plan ID when context is 'plan'
  availableItemsForAssignment: any[] = [];
  assignmentSelectionId: string | number | null = null;

  // Coach identity cache
  coachIdentity: CoachIdentity | null = null;

  // Client full profile (loaded on modal open)
  clientProfile: any = null;
  clientProfileLoading = false;

  // Auto-assign after plan creation
  autoAssignClientId: string | null = null;

  // Coach profile data
  coachProfile: any = null;
  coachProfileLoading = false;
  coachProfileSaving = false;
  coachProfileSuccess = '';
  coachProfileError = '';
  coachProfileTab: 'info' | 'security' | 'stats' = 'info';
  coachProfileEditing = false;

  coachProfileForm = {
    prenom: '',
    nom: '',
    telephone: '',
    coachSpecialite: '',
    certifications: ''
  };

  coachPasswordForm = {
    nouveau: '',
    confirmer: ''
  };

  // Form data
  exerciseForm: Omit<CoachExerciseDto, 'id'> = {
    nom: '',
    description: '',
    series: null,
    repetitions: null,
    dureeSecondes: null,
    tempsReposSecondes: null,
    poidsKg: null,
    planExerciceId: null
  };

  planForm: Omit<CoachWorkoutPlanSummaryDto, 'id' | 'assignedClientsCount'> = {
    nom: '',
    description: '',
    dureeSemaines: 1,
    seancesParSemaine: 3,
    exercisesCount: 0,
    actif: true,
    dateDebut: new Date().toISOString().split('T')[0],
    exercices: []
  };

  // Selection for Plan Creation
  selectedExerciseIds: number[] = [];
  tempNewExercises: Omit<CoachExerciseDto, 'id'>[] = [];
  
  // New Exercise helper for Plan Modal
  newExInPlan: Omit<CoachExerciseDto, 'id'> = {
    nom: '',
    description: '',
    series: 3,
    repetitions: 10,
    dureeSecondes: null,
    tempsReposSecondes: null,
    poidsKg: null,
    planExerciceId: null
  };

  // ── RDV ───────────────────────────────────────────────────────────────────
  rdvEnAttente:  RendezVous[] = [];
  rdvConfirmes:  RendezVous[] = [];
  rdvRefuses:    RendezVous[] = [];
  activeRdvTab: 'attente' | 'confirme' | 'refuse' = 'attente';
  rdvLoading = false;

  // ── CONVERSATIONS ─────────────────────────────────────────────────────────
  selectedClientId: string | null = null;
  conversationKey = 0;
  showConversation = true;

  constructor(
    private readonly coachDashboardService: CoachDashboardService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly rdvService: RendezVousService,
    private readonly http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  ngOnInit(): void {
    const coachId = this.getCoachId();
    const coachEmail = this.getCoachEmail();
    const identity: CoachIdentity = { coachId, coachEmail };

    if (!identity.coachId && !identity.coachEmail) {
      this.apiError = 'Coach identity not found. Please log in again.';
      return;
    }

    this.coachIdentity = identity;
    this.loadDashboardData(identity);
    this.loadRdv();

    // Load coach name from localStorage (set at login)
    if (isPlatformBrowser(this.platformId)) {
      const prenom = localStorage.getItem('prenom') ?? '';
      const nom    = localStorage.getItem('nom') ?? '';
      if (prenom || nom) {
        this.coachName = ('Coach ' + prenom + ' ' + nom).trim();
      }
    }

    // Load full coach profile
    if (identity.coachId) {
      this.loadCoachProfile(identity.coachId);
    }
  }

  private getCoachId(): string | undefined {
    if (isPlatformBrowser(this.platformId)) {
      return this.route.snapshot.queryParamMap.get('coachId') ??
             localStorage.getItem('userId') ??
             sessionStorage.getItem('userId') ??
             undefined;
    }
    return this.route.snapshot.queryParamMap.get('coachId') ?? undefined;
  }

  private getCoachEmail(): string | undefined {
    if (isPlatformBrowser(this.platformId)) {
      return this.route.snapshot.queryParamMap.get('coachEmail') ??
             localStorage.getItem('email') ??
             sessionStorage.getItem('email') ??
             this.extractEmailFromToken(localStorage.getItem('token')) ??
             this.extractEmailFromToken(sessionStorage.getItem('token')) ??
             undefined;
    }
    return this.route.snapshot.queryParamMap.get('coachEmail') ?? undefined;
  }

  get overviewCards(): OverviewCard[] {
    return [
      { label: 'Total Clients', value: String(this.clientsWithConfirmedRdv.length), helper: 'Clients with confirmed appointments', accent: 'green' },
      { label: 'Active Workout Plans', value: String(this.workoutPlans.length), helper: 'Recently updated plans', accent: 'blue' },
      { label: 'Total Exercises', value: String(this.exercises.length), helper: 'Reusable exercise library', accent: 'purple' },
      { label: 'Unread Messages', value: String(this.totalUnreadMessages), helper: 'Needs your response', accent: 'orange' },
      { label: 'Subscription Status', value: this.subscription.status, helper: `${this.subscription.remainingDays} days remaining`, accent: 'neutral' },
    ];
  }

  get totalUnreadMessages(): number {
    return this.conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  }

  // ── RDV METHODS ──────────────────────────────────────────────────────────

  loadRdv(): void {
    const coachId =
      this.route.snapshot.queryParamMap.get('coachId') ??
      (isPlatformBrowser(this.platformId) ? localStorage.getItem('userId') : null) ??
      (isPlatformBrowser(this.platformId) ? sessionStorage.getItem('userId') : null) ??
      '';

    if (!coachId) {
      this.rdvLoading = false;
      return;
    }

    this.rdvLoading = true;
    this.rdvService.getByCoach(coachId).subscribe({
      next: (data: RendezVous[]) => {
        this.rdvEnAttente = data.filter(r => r.statut === 'EN_ATTENTE');
        this.rdvConfirmes = data.filter(r => r.statut === 'CONFIRME');
        this.rdvRefuses   = data.filter(r => r.statut === 'REFUSE');
        this.rdvLoading   = false;
      },
      error: () => { this.rdvLoading = false; }
    });
  }

  accepterRdv(id: number): void {
    this.rdvService.accepter(id).subscribe(() => this.loadRdv());
  }

  refuserRdv(id: number): void {
    this.rdvService.refuser(id).subscribe(() => this.loadRdv());
  }

  setRdvTab(tab: 'attente' | 'confirme' | 'refuse'): void {
    this.activeRdvTab = tab;
  }

  get pendingRdvCount(): number {
    return this.rdvEnAttente.length;
  }

  /**
   * Clients who have a CONFIRMED appointment with this coach.
   * These are the only clients available for conversation — mirrors
   * the nutritionist's patientsConfirmes pattern.
   */
  get confirmedClients(): { id: any; nom: string }[] {
    return this.rdvConfirmes.map(r => ({
      id: r.userId,
      nom: r.patientNom || 'Client #' + r.userId,
    }));
  }

  /**
   * Full ClientItem list filtered to only those with a confirmed RDV.
   * Used in the Clients tab so the coach only sees clients who booked.
   */
  get clientsWithConfirmedRdv(): ClientItem[] {
    const confirmedIds = new Set(this.rdvConfirmes.map(r => String(r.userId)));
    return this.clients.filter(c => confirmedIds.has(String(c.id)));
  }

  openConversation(userId: any): void {
    this.selectedClientId = String(userId);
    this.showConversation = false;
    setTimeout(() => { this.showConversation = true; }, 0);
    this.setActiveTab('Conversations');
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
    if (tab === 'Profile' && this.coachIdentity?.coachId && !this.coachProfile) {
      this.loadCoachProfile(this.coachIdentity.coachId);
    }
  }

  // ── COACH PROFILE ─────────────────────────────────────────────────────────

  loadCoachProfile(coachId: string): void {
    this.coachProfileLoading = true;
    const token = isPlatformBrowser(this.platformId)
      ? (localStorage.getItem('token') ?? sessionStorage.getItem('token'))
      : null;
    const email = isPlatformBrowser(this.platformId)
      ? (localStorage.getItem('email') ?? sessionStorage.getItem('email') ?? '')
      : '';
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();

    // Use /by-email endpoint — most reliable, no ID lookup issues
    const url = `http://localhost:8084/api/coaches/by-email?email=${encodeURIComponent(email)}`;

    this.http.get<any>(url, { headers }).subscribe({
      next: (data) => {
        this.coachProfile = data;
        this.coachProfileLoading = false;
        this.coachName = `Coach ${data.prenom ?? ''} ${data.nom ?? ''}`.trim();
        this.coachProfileForm = {
          prenom:          data.prenom          ?? '',
          nom:             data.nom             ?? '',
          telephone:       data.telephone       ?? '',
          coachSpecialite: data.coachSpecialite ?? '',
          certifications:  data.certifications  ?? ''
        };
      },
      error: () => { this.coachProfileLoading = false; }
    });
  }

  saveCoachProfile(): void {
    if (!this.coachIdentity?.coachId) return;
    this.coachProfileSaving = true;
    this.coachProfileSuccess = '';
    this.coachProfileError = '';

    const token = isPlatformBrowser(this.platformId)
      ? (localStorage.getItem('token') ?? sessionStorage.getItem('token'))
      : null;
    const email = isPlatformBrowser(this.platformId)
      ? (localStorage.getItem('email') ?? sessionStorage.getItem('email') ?? '')
      : '';
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
    const url = `http://localhost:8084/api/coaches/by-email?email=${encodeURIComponent(email)}`;

    this.http.put<any>(url, this.coachProfileForm, { headers }).subscribe({
      next: () => {
        this.coachProfileSaving = false;
        this.coachProfileSuccess = 'Profile updated successfully!';
        this.coachProfileEditing = false;
        this.coachName = `Coach ${this.coachProfileForm.prenom} ${this.coachProfileForm.nom}`.trim();
        if (this.coachProfile) {
          this.coachProfile.prenom          = this.coachProfileForm.prenom;
          this.coachProfile.nom             = this.coachProfileForm.nom;
          this.coachProfile.telephone       = this.coachProfileForm.telephone;
          this.coachProfile.coachSpecialite = this.coachProfileForm.coachSpecialite;
          this.coachProfile.certifications  = this.coachProfileForm.certifications;
        }
        setTimeout(() => this.coachProfileSuccess = '', 3000);
      },
      error: (err: any) => {
        this.coachProfileSaving = false;
        this.coachProfileError = err?.error?.message ?? 'Failed to update profile.';
      }
    });
  }

  saveCoachPassword(): void {
    this.coachProfileError = '';
    if (!this.coachPasswordForm.nouveau || !this.coachPasswordForm.confirmer) {
      this.coachProfileError = 'Please fill in all fields.'; return;
    }
    if (this.coachPasswordForm.nouveau !== this.coachPasswordForm.confirmer) {
      this.coachProfileError = 'Passwords do not match.'; return;
    }
    if (this.coachPasswordForm.nouveau.length < 8) {
      this.coachProfileError = 'Minimum 8 characters.'; return;
    }
    if (!this.coachIdentity?.coachId) return;

    this.coachProfileSaving = true;
    const token = isPlatformBrowser(this.platformId)
      ? (localStorage.getItem('token') ?? sessionStorage.getItem('token'))
      : null;
    const email = isPlatformBrowser(this.platformId)
      ? (localStorage.getItem('email') ?? sessionStorage.getItem('email') ?? '')
      : '';
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
    const url = `http://localhost:8084/api/coaches/by-email/change-password?email=${encodeURIComponent(email)}`;

    this.http.post<any>(url, { newPassword: this.coachPasswordForm.nouveau }, { headers }).subscribe({
      next: () => {
        this.coachProfileSaving = false;
        this.coachProfileSuccess = 'Password changed successfully!';
        this.coachPasswordForm = { nouveau: '', confirmer: '' };
        setTimeout(() => this.coachProfileSuccess = '', 3000);
      },
      error: (err: any) => {
        this.coachProfileSaving = false;
        this.coachProfileError = err?.error?.error ?? 'Failed to change password.';
      }
    });
  }

  logout(): void {
    if (confirm('Are you sure you want to log out?')) {
      if (isPlatformBrowser(this.platformId)) {
        localStorage.clear();
        sessionStorage.clear();
      }
      window.location.href = '/authentification/coach';
    }
  }

  renewSubscription(): void {
    // Navigate to the subscription page — it handles existing users via localStorage
    this.router.navigate(['/abonnement']);
  }

  // ── DASHBOARD DATA ────────────────────────────────────────────────────────

  private loadDashboardData(identity: CoachIdentity): void {
    this.isLoading = true;
    this.apiError = '';

    forkJoin({
      overview: this.coachDashboardService.getOverview(identity).pipe(catchError(err => {
        console.error('Error loading overview:', err);
        return of({ totalClients: 0, activeWorkoutPlans: 0, totalExercises: 0, unreadMessages: 0, subscriptionStatus: 'Active', subscriptionRemainingDays: 0 } as CoachDashboardOverviewDto);
      })),
      plans: this.coachDashboardService.getWorkoutPlans(identity).pipe(catchError(err => {
        console.error('Error loading plans:', err);
        return of([]);
      })),
      exercises: this.coachDashboardService.getExercises(identity.coachId).pipe(catchError(err => {
        console.error('Error loading exercises:', err);
        return of([]);
      })),
      clients: this.coachDashboardService.getClients(identity).pipe(catchError(err => {
        console.error('Error loading clients:', err);
        return of([]);
      })),
      conversations: this.coachDashboardService.getConversations(identity).pipe(catchError(err => {
        console.error('Error loading conversations:', err);
        return of([]);
      })),
      analytics: this.coachDashboardService.getAnalytics(identity).pipe(catchError(err => {
        console.error('Error loading analytics:', err);
        return of([]);
      })),
      notifications: this.coachDashboardService.getNotifications(identity).pipe(catchError(err => {
        console.error('Error loading notifications:', err);
        return of([]);
      })),
    }).subscribe({
      next: (data) => {
        this.applyOverview(data.overview);
        this.workoutPlans = data.plans.map((plan) => this.mapPlan(plan));
        this.exercises = data.exercises.map((exercise) => this.mapExercise(exercise));
        this.clients = data.clients.map((client, index) => this.mapClient(client, index));
        this.conversations = data.conversations.map((chat) => this.mapConversation(chat));
        this.analytics = data.analytics.map((item) => this.mapAnalytics(item));
        this.notifications = data.notifications.map((notif, index) => this.mapNotification(notif, index + 1));
        this.isLoading = false;
      },
      error: (error) => {
        this.isLoading = false;
        this.apiError = error?.error?.error ?? error?.message ?? this.apiErrorDefault;
      },
    });
  }

  // ── DETAIL MODALS ──────────────────────────────────────────────────────
  
  openClientDetails(client: ClientItem): void {
    this.selectedClient = client;
    this.clientProfile = null;
    this.clientProfileLoading = true;
    this.showClientDetailsModal = true;

    const token = isPlatformBrowser(this.platformId)
      ? (localStorage.getItem('token') ?? sessionStorage.getItem('token'))
      : null;
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();

    this.http.get<any>(`http://localhost:8084/api/patients/${client.id}`, { headers }).subscribe({
      next: (data) => {
        this.clientProfile = data;
        this.clientProfileLoading = false;
      },
      error: () => {
        this.clientProfileLoading = false;
      }
    });
  }

  closeClientDetails(): void {
    this.showClientDetailsModal = false;
    this.selectedClient = null;
    this.clientProfile = null;
  }

  getImcValue(profile: any): number | null {
    if (!profile?.weight || !profile?.height) return null;
    const h = profile.height / 100;
    return Math.round((profile.weight / (h * h)) * 10) / 10;
  }

  getImcLabel(imc: number | null): string {
    if (imc === null) return '—';
    if (imc < 18.5) return 'Underweight';
    if (imc < 25)   return 'Normal';
    if (imc < 30)   return 'Overweight';
    return 'Obese';
  }

  getImcAccent(imc: number | null): string {
    if (imc === null) return 'neutral';
    if (imc < 18.5) return 'blue';
    if (imc < 25)   return 'green';
    if (imc < 30)   return 'orange';
    return 'red';
  }

  openPlanView(planId: number): void {
    this.coachDashboardService.getPlanById(planId).subscribe({
      next: (plan) => {
        this.selectedPlan = plan;
        this.showPlanViewModal = true;
      },
      error: (err: any) => console.error('Error fetching plan details:', err)
    });
  }

  closePlanView(): void {
    this.showPlanViewModal = false;
    this.selectedPlan = null;
  }

  // ── ACTIONS FROM MODALS ────────────────────────────────────────────────
  
  messageClient(client: ClientItem): void {
    this.closeClientDetails();
    // Small delay to let the modal close before switching tab
    setTimeout(() => this.openConversation(client.id), 50);
  }

  duplicatePlan(plan: CoachWorkoutPlanSummaryDto): void {
    const duplicatedPlan: Omit<CoachWorkoutPlanSummaryDto, 'id' | 'assignedClientsCount'> = {
      nom: `${plan.nom} (Copy)`,
      description: plan.description,
      dureeSemaines: plan.dureeSemaines,
      seancesParSemaine: plan.seancesParSemaine,
      exercisesCount: plan.exercisesCount,
      actif: true,
      dateDebut: new Date().toISOString().split('T')[0],
      exercices: plan.exercices
        ? plan.exercices.map(ex => ({
            id: ex.id,
            nom: ex.nom,
            description: ex.description,
            series: ex.series,
            repetitions: ex.repetitions,
            dureeSecondes: ex.dureeSecondes,
            tempsReposSecondes: ex.tempsReposSecondes,
            poidsKg: ex.poidsKg,
            planExerciceId: ex.planExerciceId,
          }))
        : []
    };

    this.coachDashboardService.createPlan(duplicatedPlan).subscribe({
      next: (newPlan) => {
        this.workoutPlans.push(this.mapPlan(newPlan));
        this.closePlanView();
        alert('Plan duplicated successfully!');
      },
      error: (err: any) => console.error('Error duplicating plan:', err)
    });
  }

  openAddExerciseToPlan(plan: CoachWorkoutPlanSummaryDto): void {
    this.closePlanView();
    const planItem: WorkoutPlanItem = {
      id: plan.id,
      nom: plan.nom,
      dureeSemaines: plan.dureeSemaines,
      seancesParSemaine: plan.seancesParSemaine,
      assignedClientsCount: plan.assignedClientsCount ?? 0,
      exercisesCount: plan.exercisesCount ?? 0,
    };
    this.openEditPlanModal(planItem);
  }

  // ── ASSIGNMENT LOGIC ───────────────────────────────────────────────────

  openAssignPlanToClientModal(client: ClientItem): void {
    this.assignmentContext = 'client';
    this.targetAssignmentId = client.id;
    this.targetAssignmentPlanId = null;
    this.availableItemsForAssignment = this.workoutPlans;
    this.assignmentSelectionId = null;
    this.showAssignmentModal = true;
  }

  openAssignPlanToClientModalFromPlan(plan: { id: number }): void {
    this.assignmentContext = 'plan';
    this.targetAssignmentId = null;
    this.targetAssignmentPlanId = plan.id;
    this.availableItemsForAssignment = this.clients;
    this.assignmentSelectionId = null;
    this.showAssignmentModal = true;
  }

  closeAssignmentModal(): void {
    this.showAssignmentModal = false;
    this.targetAssignmentId = null;
    this.targetAssignmentPlanId = null;
    this.assignmentSelectionId = null;
  }

  confirmAssignment(): void {
    if (!this.coachIdentity) return;

    const coachId = this.coachIdentity.coachId;
    if (!coachId) {
      alert('Coach identity not found. Please log in again.');
      return;
    }

    let clientId: string | null = null;
    let planId: number | null = null;

    if (this.assignmentContext === 'client') {
      // targetAssignmentId = clientId, assignmentSelectionId = planId
      clientId = this.targetAssignmentId;
      planId = this.assignmentSelectionId as number;
    } else {
      // targetAssignmentPlanId = planId, assignmentSelectionId = clientId
      clientId = this.assignmentSelectionId as string;
      planId = this.targetAssignmentPlanId;
    }

    if (!clientId || !planId) {
      alert('Please select a ' + (this.assignmentContext === 'client' ? 'plan' : 'client') + ' to assign.');
      return;
    }

    this.coachDashboardService.assignPlanToClient({ coachId, clientId, planExerciceId: planId }).subscribe({
      next: () => {
        alert('Assignment successful!');
        this.closeAssignmentModal();
        this.closePlanView();
        this.closeClientDetails();
        this.loadDashboardData(this.coachIdentity!);
      },
      error: (err: any) => {
        const msg = err?.error?.message ?? err?.message ?? 'Failed to assign. Please try again.';
        alert(msg);
      }
    });
  }

  // ── PLAN CRUD ──────────────────────────────────────────────────────────

  openAddPlanModal(): void {
    this.isEditingPlan = false;
    this.currentPlan = null;
    this.autoAssignClientId = null;
    this.selectedExerciseIds = [];
    this.tempNewExercises = [];
    this.planForm = {
      nom: '',
      description: '',
      dureeSemaines: 1,
      seancesParSemaine: 3,
      exercisesCount: 0,
      actif: true,
      dateDebut: new Date().toISOString().split('T')[0],
      exercices: []
    };
    this.showPlanModal = true;
  }

  /** Opens plan creation modal and auto-assigns the new plan to the given client on save */
  openCreatePlanForClient(clientId: string): void {
    this.closeAssignmentModal();
    this.autoAssignClientId = clientId;
    this.isEditingPlan = false;
    this.currentPlan = null;
    this.selectedExerciseIds = [];
    this.tempNewExercises = [];
    this.planForm = {
      nom: '',
      description: '',
      dureeSemaines: 1,
      seancesParSemaine: 3,
      exercisesCount: 0,
      actif: true,
      dateDebut: new Date().toISOString().split('T')[0],
      exercices: []
    };
    this.showPlanModal = true;
  }

  openEditPlanModal(plan: WorkoutPlanItem): void {
    this.isEditingPlan = true;
    this.currentPlan = plan;
    // Pre-load exercises already linked to this plan
    this.coachDashboardService.getExercisesByPlan(plan.id).subscribe({
      next: (exList) => {
        this.selectedExerciseIds = exList.map(e => e.id);
      },
      error: () => { this.selectedExerciseIds = []; }
    });
    this.planForm = {
      nom: plan.nom,
      description: '',
      dureeSemaines: plan.dureeSemaines,
      seancesParSemaine: plan.seancesParSemaine,
      exercisesCount: plan.exercisesCount,
      actif: true,
      dateDebut: new Date().toISOString().split('T')[0],
      exercices: []
    };
    this.showPlanModal = true;
  }

  closePlanModal(): void {
    this.showPlanModal = false;
    this.currentPlan = null;
    this.isEditingPlan = false;
    this.autoAssignClientId = null;
    this.selectedExerciseIds = [];
    this.tempNewExercises = [];
  }

  toggleExerciseSelection(id: number): void {
    const idx = this.selectedExerciseIds.indexOf(id);
    if (idx > -1) {
      this.selectedExerciseIds.splice(idx, 1);
    } else {
      this.selectedExerciseIds.push(id);
    }
  }

  addNewExerciseToTempPlan(): void {
    if (!this.newExInPlan.nom) return;
    this.tempNewExercises.push({ ...this.newExInPlan });
    this.newExInPlan = { 
      nom: '', 
      description: '', 
      series: 3, 
      repetitions: 10, 
      dureeSecondes: null, 
      tempsReposSecondes: null, 
      poidsKg: null, 
      planExerciceId: null 
    };
  }

  removeTempExercise(index: number): void {
    this.tempNewExercises.splice(index, 1);
  }

  savePlan(): void {
    if (this.selectedExerciseIds.length === 0) {
      alert('Please select at least one exercise.');
      return;
    }

    const coachId = this.coachIdentity?.coachId;

    const exercicesForPlan = this.selectedExerciseIds.map(id => ({
      id,
      nom: '',
      description: '',
      series: null,
      repetitions: null,
      dureeSecondes: null,
      tempsReposSecondes: null,
      poidsKg: null,
      planExerciceId: null,
    }));

    this.planForm.exercices = exercicesForPlan;

    if (this.isEditingPlan && this.currentPlan) {
      this.coachDashboardService.updatePlan(this.currentPlan.id, { ...this.planForm, coachId }).subscribe({
        next: (updatedPlan) => {
          const index = this.workoutPlans.findIndex(p => p.id === updatedPlan.id);
          if (index !== -1) {
            this.workoutPlans[index] = this.mapPlan(updatedPlan);
          }
          this.closePlanModal();
        },
        error: (err: any) => console.error('Error updating plan:', err)
      });
    } else {
      this.coachDashboardService.createPlan({ ...this.planForm, coachId }).subscribe({
        next: (newPlan) => {
          this.workoutPlans.push(this.mapPlan(newPlan));
          // Auto-assign to client if triggered from client card
          if (this.autoAssignClientId && coachId) {
            this.coachDashboardService.assignPlanToClient({
              coachId,
              clientId: this.autoAssignClientId,
              planExerciceId: newPlan.id
            }).subscribe({
              next: () => {
                this.autoAssignClientId = null;
                this.closePlanModal();
                this.loadDashboardData(this.coachIdentity!);
                alert(`Plan "${newPlan.nom}" created and assigned successfully!`);
              },
              error: (err: any) => {
                this.autoAssignClientId = null;
                this.closePlanModal();
                console.error('Auto-assign failed:', err);
                alert(`Plan created but assignment failed: ${err?.error?.message ?? 'Please assign manually.'}`);
              }
            });
          } else {
            this.closePlanModal();
          }
        },
        error: (err: any) => console.error('Error creating plan:', err)
      });
    }
  }

  deletePlan(plan: WorkoutPlanItem): void {
    if (confirm(`Are you sure you want to delete the plan "${plan.nom}"?`)) {
      this.coachDashboardService.deletePlan(plan.id).subscribe({
        next: () => {
          this.workoutPlans = this.workoutPlans.filter(p => p.id !== plan.id);
        },
        error: (err: any) => console.error('Error deleting plan:', err)
      });
    }
  }

  // ── EXERCISE CRUD ──────────────────────────────────────────────────────

  openAddExerciseModal(): void {
    this.isEditingExercise = false;
    this.currentExercise = null;
    this.exerciseForm = {
      nom: '',
      description: '',
      series: null,
      repetitions: null,
      dureeSecondes: null,
      tempsReposSecondes: null,
      poidsKg: null,
      planExerciceId: null
    };
    this.showExerciseModal = true;
  }

  openEditExerciseModal(exercise: ExerciseItem): void {
    this.isEditingExercise = true;
    // On doit retrouver l'exercice complet pour le formulaire car ExerciseItem est simplifié
    this.coachDashboardService.getExerciseById(exercise.id).subscribe({
      next: (fullEx) => {
        this.currentExercise = this.mapExercise(fullEx);
        this.exerciseForm = {
          nom: fullEx.nom,
          description: fullEx.description,
          series: fullEx.series,
          repetitions: fullEx.repetitions,
          dureeSecondes: fullEx.dureeSecondes,
          tempsReposSecondes: fullEx.tempsReposSecondes,
          poidsKg: fullEx.poidsKg,
          planExerciceId: fullEx.planExerciceId
        };
        this.showExerciseModal = true;
      },
      error: (err: any) => console.error('Error fetching exercise details:', err)
    });
  }

  closeExerciseModal(): void {
    this.showExerciseModal = false;
    this.currentExercise = null;
    this.isEditingExercise = false;
  }

  saveExercise(): void {
    const coachId = this.coachIdentity?.coachId;

    if (this.isEditingExercise && this.currentExercise) {
      this.coachDashboardService.updateExercise(this.currentExercise.id, { ...this.exerciseForm, coachId }).subscribe({
        next: (updatedEx) => {
          const index = this.exercises.findIndex(e => e.id === updatedEx.id);
          if (index !== -1) {
            this.exercises[index] = this.mapExercise(updatedEx);
          }
          this.closeExerciseModal();
        },
        error: (err: any) => console.error('Error updating exercise:', err)
      });
    } else {
      this.coachDashboardService.createExercise({ ...this.exerciseForm, coachId }).subscribe({
        next: (newEx) => {
          this.exercises.push(this.mapExercise(newEx));
          this.closeExerciseModal();
        },
        error: (err: any) => console.error('Error creating exercise:', err)
      });
    }
  }

  deleteExercise(exercise: ExerciseItem): void {
    if (confirm(`Are you sure you want to delete the exercise "${exercise.nom}"?`)) {
      this.coachDashboardService.deleteExercise(exercise.id).subscribe({
        next: () => {
          this.exercises = this.exercises.filter(e => e.id !== exercise.id);
        },
        error: (err: any) => console.error('Error deleting exercise:', err)
      });
    }
  }

  private applyOverview(overview: CoachDashboardOverviewDto): void {
    this.subscription.status = overview.subscriptionStatus === 'Active' ? 'Active' : 'Expired';
    this.subscription.remainingDays = overview.subscriptionRemainingDays;
  }

  private mapPlan(plan: CoachWorkoutPlanSummaryDto): WorkoutPlanItem {
    return {
      id: plan.id,
      nom: plan.nom,
      dureeSemaines: plan.dureeSemaines,
      seancesParSemaine: plan.seancesParSemaine,
      assignedClientsCount: plan.assignedClientsCount || 0,
      exercisesCount: plan.exercisesCount || plan.exercices?.length || 0,
    };
  }

  private mapExercise(exercise: CoachExerciseDto): ExerciseItem {
    return {
      id: exercise.id,
      nom: exercise.nom,
      categorie: this.detectExerciseCategory(exercise),
      description: exercise.description || 'No description',
    };
  }

  private mapClient(client: CoachDashboardClientDto, index: number): ClientItem {
    return {
      id: client.id,
      name: client.name,
      email: client.email,
      assignedPlans: client.assignedPlans ?? [],
      progressStatus: client.progressStatus,
    };
  }

  private mapConversation(chat: CoachConversationDto): ConversationItem {
    return {
      id: chat.id,
      clientName: chat.clientName,
      lastMessage: chat.lastMessagePreview || 'No messages yet',
      timestamp: this.formatDate(chat.lastMessageAt),
      unreadCount: chat.unreadCount,
    };
  }

  private mapAnalytics(item: CoachAnalyticsItemDto): AnalyticsItem {
    return {
      label: item.label,
      value: item.value,
      trend: item.trend,
      fillPercent: item.fillPercent,
    };
  }

  private mapNotification(notification: CoachNotificationDto, id: number): NotificationItem {
    return { id, text: notification.text, type: notification.type };
  }

  private formatDate(dateValue: string | null): string {
    if (!dateValue) {
      return 'No activity';
    }
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) {
      return dateValue;
    }
    return d.toLocaleString([], {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private detectExerciseCategory(exercise: CoachExerciseDto): string {
    if ((exercise.dureeSecondes ?? 0) >= 120) {
      return 'Cardio';
    }
    if ((exercise.series ?? 0) >= 3) {
      return 'Strength';
    }
    return 'General';
  }

  private extractEmailFromToken(token: string | null): string | undefined {
    if (!token) {
      return undefined;
    }

    const parts = token.split('.');
    if (parts.length < 2) {
      return undefined;
    }

    try {
      const payloadJson = atob(parts[1]);
      const payload = JSON.parse(payloadJson) as { sub?: string; email?: string };
      return payload.sub ?? payload.email;
    } catch {
      return undefined;
    }
  }
}
