import { Component, OnInit, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { RendezVousService } from '../../../services/rendez-vous';
import { ConsultationService } from '../../../services/consultation';
import { ConversationComponent } from '../../../conversation/conversation';

import { RendezVous } from '../../../../interfaces/rendez-vous';
import { Consultation } from '../../../../interfaces/consultation';
import { Patient, PatientService } from '../../../services/patient';
import { SuiviService } from '../../../../services/suivi';
import { ObjectifService } from '../../../../services/objectif-personnel';
import { PatientInfo } from '../../../../interfaces/PatientInfo';

interface RepasJour {
  id: number;
  type: string;
  typeRepas: string;
  nom: string;
  calories: number;
  aliments: string | string[];
  proteines?: number;
  glucides?: number;
  lipides?: number;
  notes?: string;
}

interface PlanAlimentaireDetail {
  id: number;
  titre: string;
  objectif: string;
  dateCreation: string;
  patientId: number;
  nutritionnisteId: number;
  repas: RepasJour[];
}

interface Exercice {
  id: number;
  nom: string;
  description: string;
  series?: number | null;
  repetitions?: number | null;
  dureeSecondes?: number | null;
  tempsReposSecondes?: number | null;
  poidsKg?: number | null;
  categorie?: string;
}

interface ProgrammeEntrainement {
  id: number;
  nom: string;
  description?: string;
  dureeSemaines: number;
  seancesParSemaine: number;
  dateDebut?: string;
  exercices: Exercice[];
}

export interface AgendaNote {
  id: number;
  text: string;
  completed: boolean;
  date: string;
}

export interface HistoryItem {
  id: string | number; // To uniquely identify (maybe prefix with 'C-' or 'R-')
  type: 'CONSULTATION' | 'RDV';
  dateStr: string;
  timestamp: number;
  title: string;
  subtitle: string;
  status?: string;
  originalData: any; // The raw Consultation or RendezVous
}

export type Section =
  | 'dashboard'
  | 'rdv-nutritionniste'
  | 'rdv-coach'
  | 'plan'
  | 'programme'
  | 'messages-nutritionniste'
  | 'messages-coach'
  | 'profile'
  | 'parametres';

@Component({
  selector: 'app-patient-dashboard',
  standalone: true,
  imports: [CommonModule, DecimalPipe, FormsModule, ConversationComponent, RouterLink],
  templateUrl: './patient-dashboard.html',
  styleUrls: ['./patient-dashboard.css']
})
export class PatientDashboard implements OnInit, OnDestroy {

  userId = '';

  nutritionnisteId: string | number | null = null;
  coachId: string | number | null = null;

  activeSection: any = 'dashboard';

  // RDV Nutritionniste
  rdvNutriEnAttente: RendezVous[] = [];
  rdvNutriConfirmes: RendezVous[] = [];
  rdvNutriRefuses: RendezVous[] = [];
  activeTabNutri: 'attente' | 'confirme' | 'refuse' = 'attente';

  // RDV Coach
  rdvCoachEnAttente: RendezVous[] = [];
  rdvCoachConfirmes: RendezVous[] = [];
  rdvCoachRefuses: RendezVous[] = [];
  activeTabCoach: 'attente' | 'confirme' | 'refuse' = 'attente';

  takenSlotsNutri: { date: string; heure: string }[] = [];

  // Suivi Quotidien (Daily Tracking)
  dailyStats = {
    water: 0, goalWater: 2.5,
    activity: 0, goalActivity: 5,
    nutrition: 0, // percentage
    sleep: 0, goalSleep: 8
  };
  hasDailyData = false;
  motivationLevel = 80;
  evolutionData = [
    { jour: 'Lun', pct: 65 },
    { jour: 'Mar', pct: 80 },
    { jour: 'Mer', pct: 85 },
    { jour: 'Jeu', pct: 70 },
    { jour: 'Ven', pct: 75 },
    { jour: 'Sam', pct: 90 },
    { jour: 'Dim', pct: 80 }
  ];
  takenSlotsCoach: { date: string; heure: string }[] = [];
  confirmingRdv = false;

  consultations: Consultation[] = [];
  derniereConsultation: Consultation | null = null;
  selectedConsultation: Consultation | null = null;
  showConsultationModal = false;

  agendaNotes: AgendaNote[] = [];
  newNoteText = '';

  historyItems: HistoryItem[] = [];

  planAlimentaire: PlanAlimentaireDetail | null = null;
  planLoading = false;
  private readonly planApi = '/api/plans-alimentaires';

  programmeEntrainement: ProgrammeEntrainement | null = null;
  programmeLoading = false;
  private readonly programmeApi = '/api/plans-exercices';

  // Calendrier
  showCalendar = false;
  calendarTarget: 'nutritionniste' | 'coach' = 'nutritionniste';
  calendarYear = 0;
  calendarMonth = 0;
  calendarDays: (number | null)[] = [];
  selectedDate: Date | null = null;
  selectedSlot: string | null = null;
  rdvMotif = '';
  confirmationDone = false;
  confirmationError = false;

  readonly timeSlots = [
    '08:00', '08:30', '09:00', '09:30',
    '10:00', '10:30', '11:00', '11:30',
    '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00'
  ];

  readonly MONTH_NAMES = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];
  readonly DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  profile: PatientInfo = {
    prenom: '',
    nom: '',
    email: '',
    phone: '',
    age: 0,
    height: 0,
    weight: 0,
    goal: '',
    lifestyleLevel: '',
    ville: '',
    dateNaissance: '',
    sexe: '',
    adresse: '',
    typeAbonnement: ''
  };

  newPassword = '';
  confirmPassword = '';
  profileSaveSuccess = false;
  profileSaveError = false;

  nutritionnistes: any[] = [];
  nutritionnisteSelectionne: any = null;

  coaches: any[] = [];
  coachSelectionne: any = null;

  private pollSub: Subscription | null = null;

  private platformId = inject(PLATFORM_ID);

  constructor(
    private rdvService: RendezVousService,
    private consultService: ConsultationService,
    private http: HttpClient,
    private patientService: PatientService,
    private suiviService: SuiviService,
    private objectifService: ObjectifService,
    private route: ActivatedRoute
  ) { }

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token') ?? sessionStorage.getItem('token');
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const routeId = this.route.snapshot.paramMap.get('userId');
    if (routeId) {
      this.userId = routeId;
      localStorage.setItem('userId', routeId);
    } else {
      this.userId = localStorage.getItem('userId') ?? '';
    }

    // Restore saved theme preference
    const savedTheme = localStorage.getItem('patientTheme') ?? 'light';
    this.displayPrefs.theme = savedTheme;
    this.previewTheme = savedTheme;

    console.log('✅ PatientDashboard — userId =', this.userId);

    if (!this.userId) {
      console.error('❌ userId introuvable — redirection login');
      return;
    }

    const now = new Date();
    this.calendarYear = now.getFullYear();
    this.calendarMonth = now.getMonth();
    this.buildCalendar();
    this.loadAll();
    this.loadProfile();
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }
  loadAllRdvForStats(): void {
    this.rdvService.getByPatient(this.userId).subscribe((data: RendezVous[]) => {
      this.rdvNutriConfirmes = data.filter(r => r.statut === 'CONFIRME' && r.nutritionnisteId);
      this.rdvCoachConfirmes = data.filter(r => r.statut === 'CONFIRME' && r.coachId);
      this.rdvNutriEnAttente = data.filter(r => r.statut === 'EN_ATTENTE' && r.nutritionnisteId);
      this.rdvCoachEnAttente = data.filter(r => r.statut === 'EN_ATTENTE' && r.coachId);
    });
  }

  loadAll(): void {
    this.loadConsultations();
    this.loadPlan();
    this.loadProgramme();
    this.loadNutritionnistes();
    this.loadCoaches();
    this.loadDailyTracking();
    this.loadAgendaNotes();
    this.loadHistoryItems();
    this.loadAllRdvForStats();
  }

  loadDailyTracking(): void {
    if (!this.userId) return;

    // Load goals and suivi independently — a missing objectif should not block suivi display
    this.objectifService.getObjectif(this.userId).subscribe({
      next: (goals: any) => {
        this.dailyStats.goalWater = goals.objectif_coupes_eau || 2.5;
        this.dailyStats.goalSleep = goals.objectif_heures_sommeil || 8;
        this.dailyStats.goalActivity = goals.objectif_exercices_semaine || 5;
      },
      error: () => { /* use defaults if no objectif exists */ }
    });

    this.suiviService.getSuiviDuJour(this.userId).subscribe({
      next: (suivi: any) => {
        this.dailyStats.water = suivi.nb_coupes_bues || 0;
        this.dailyStats.sleep = suivi.nb_heures_sommeil || 0;
        this.dailyStats.activity = suivi.nb_exercices_faites || 0;
        this.updateNutritionPercent();
        this.hasDailyData = (this.dailyStats.water > 0 || this.dailyStats.sleep > 0 || this.dailyStats.activity > 0);
      },
      error: () => { /* no suivi for today yet — leave at 0 */ }
    });
  }

  loadProfile(): void {
    if (!this.userId) return;
    this.patientService.getById(this.userId).subscribe({
      next: (data: Patient) => {
        console.log('✅ loadProfile raw data:', data);
        this.profile.prenom = data.prenom ?? '';
        this.profile.nom = data.nom ?? '';
        this.profile.email = data.email ?? '';
        this.profile.phone = data.telephone ?? '';
        this.profile.dateNaissance = data.dateNaissance ?? '';
        this.profile.sexe = data.sexe ?? '';
        this.profile.adresse = data.adresse ?? '';
        this.profile.typeAbonnement = data.typeAbonnement ?? '';
        this.profile.age = data.age ?? 0;
        this.profile.height = data.height ?? 0;
        this.profile.weight = data.weight ?? 0;
        this.profile.goal = data.goal ?? '';
        this.profile.lifestyleLevel = data.lifestyleLevel ?? '';
        console.log('✅ loadProfile mapped profile:', this.profile);
      },
      error: (err) => console.error('❌ Erreur loadProfile:', err)
    });
  }

  saveProfile(): void {
    this.profileSaveSuccess = false;
    this.profileSaveError = false;

    const payload: any = {
      prenom: this.profile.prenom,
      nom: this.profile.nom,
      email: this.profile.email,
      telephone: this.profile.phone,
      dateNaissance: this.profile.dateNaissance,
      sexe: this.profile.sexe,
      adresse: this.profile.adresse,
      age: this.profile.age,
      taille: this.profile.height,
      poids: this.profile.weight,
      objectif: this.profile.goal,
      niveauActivite: this.profile.lifestyleLevel,
    };

    if (this.newPassword) {
      payload['password'] = this.newPassword;
    }

    this.patientService.update(this.userId, payload).subscribe({
      next: () => {
        this.profileSaveSuccess = true;
        this.newPassword = '';
        setTimeout(() => this.profileSaveSuccess = false, 4000);
      },
      error: (err) => {
        console.error('❌ Erreur saveProfile:', err);
        this.profileSaveError = true;
        setTimeout(() => this.profileSaveError = false, 4000);
      }
    });
  }

  getImcValue(): string {
    if (this.derniereConsultation && this.derniereConsultation.imc) {
      return this.derniereConsultation.imc.toFixed(1);
    }
    if (this.profile.weight && this.profile.height) {
      const heightInMeters = this.profile.height / 100;
      const imc = this.profile.weight / (heightInMeters * heightInMeters);
      return imc.toFixed(1);
    }
    return '0.0';
  }

  changePlan(planId: string): void {
    // Navigate to abonnement page to process payment for new plan
    import('@angular/router').then(({ Router }) => { });
    this.http.get<any>(`/api/patients/${this.userId}`, { headers: this.getHeaders() }).subscribe();
    // Simple: just update the display locally — real change goes through abonnement page
    window.location.href = '/abonnement';
  }

  loadRdvNutri(nutriId?: number | string): void {
    const idToFilter = String(nutriId ?? this.nutritionnisteId);
    this.rdvService.getByPatient(this.userId).subscribe((data: RendezVous[]) => {
      const mine = data.filter(r => String(r.nutritionnisteId) === idToFilter);
      this.rdvNutriEnAttente = mine.filter(r => r.statut === 'EN_ATTENTE');
      this.rdvNutriConfirmes = mine.filter(r => r.statut === 'CONFIRME');
      this.rdvNutriRefuses = mine.filter(r => r.statut === 'REFUSE');
      this.takenSlotsNutri = mine.map(r => ({
        date: r.dateHeure.substring(0, 10),
        heure: r.dateHeure.substring(11, 16)
      }));
    });
  }

  loadRdvCoach(coachId?: number | string): void {
    const idToFilter = String(coachId ?? this.coachId);
    if (!idToFilter || idToFilter === 'null') return;
    this.rdvService.getByPatient(this.userId).subscribe((data: RendezVous[]) => {
      const mine = data.filter(r => String(r.coachId) === idToFilter);
      this.rdvCoachEnAttente = mine.filter(r => r.statut === 'EN_ATTENTE');
      this.rdvCoachConfirmes = mine.filter(r => r.statut === 'CONFIRME');
      this.rdvCoachRefuses = mine.filter(r => r.statut === 'REFUSE');
      this.takenSlotsCoach = mine.map(r => ({
        date: r.dateHeure.substring(0, 10),
        heure: r.dateHeure.substring(11, 16)
      }));
    });
  }

  loadConsultations(): void {
    this.consultService.getAll().subscribe((data: Consultation[]) => {
      this.consultations = data
        .filter(c => String(c.userId) === String(this.userId))
        .sort((a, b) =>
          new Date(b.dateConsultation).getTime() - new Date(a.dateConsultation).getTime()
        );
      this.derniereConsultation = this.consultations[0] ?? null;
    });
  }

  loadHistoryItems(): void {
    if (!this.userId) return;

    let consults: Consultation[] = [];
    let rdvs: RendezVous[] = [];

    // Fetch Consultations
    this.consultService.getAll().subscribe((cData) => {
      consults = cData.filter(c => String(c.userId) === String(this.userId));

      // Fetch RDVs
      this.rdvService.getAll().subscribe((rData) => {
        rdvs = rData.filter(r => String(r.userId) === String(this.userId));

        // Merge and Map
        const items: HistoryItem[] = [];

        consults.forEach(c => {
          items.push({
            id: `C-${c.id}`,
            type: 'CONSULTATION',
            dateStr: c.dateConsultation,
            timestamp: new Date(c.dateConsultation).getTime(),
            title: `Consultation #${c.id}`,
            subtitle: c.objectif || 'Suivi général',
            originalData: c
          });
        });

        rdvs.forEach(r => {
          items.push({
            id: `R-${r.id}`,
            type: 'RDV',
            dateStr: r.dateHeure,
            timestamp: new Date(r.dateHeure).getTime(),
            title: `Rendez-vous ${r.typeIntervenant === 'NUTRITIONNISTE' ? 'Nutritionniste' : 'Coach'}`,
            subtitle: r.motif || 'Séance',
            status: r.statut,
            originalData: r
          });
        });

        // Sort descending by date
        this.historyItems = items.sort((a, b) => b.timestamp - a.timestamp);
      });
    });
  }

  openConsultation(id: number): void {
    this.consultService.getById(id).subscribe((data: Consultation) => {
      this.selectedConsultation = data;
      this.showConsultationModal = true;
    });
  }

  closeConsultationModal(): void {
    this.showConsultationModal = false;
    this.selectedConsultation = null;
  }

  // --- AGENDA NOTES LOGIC ---

  loadAgendaNotes(): void {
    if (!isPlatformBrowser(this.platformId) || !this.userId) return;
    const stored = localStorage.getItem(`agendaNotes_${this.userId}`);
    if (stored) {
      try {
        this.agendaNotes = JSON.parse(stored);
      } catch (e) {
        this.agendaNotes = [];
      }
    }
  }

  saveAgendaNotes(): void {
    if (!isPlatformBrowser(this.platformId) || !this.userId) return;
    localStorage.setItem(`agendaNotes_${this.userId}`, JSON.stringify(this.agendaNotes));
  }

  addNote(): void {
    const text = this.newNoteText.trim();
    if (!text) return;
    this.agendaNotes.unshift({
      id: Date.now(),
      text,
      completed: false,
      date: new Date().toISOString()
    });
    this.newNoteText = '';
    this.saveAgendaNotes();
  }

  toggleNote(note: AgendaNote): void {
    note.completed = !note.completed;
    this.saveAgendaNotes();
  }

  deleteNote(id: number): void {
    this.agendaNotes = this.agendaNotes.filter(n => n.id !== id);
    this.saveAgendaNotes();
  }

  // --------------------------

  loadNutritionnistes(): void {
    this.rdvService.getAllNutritionnistes().subscribe((data: any[]) => {
      this.nutritionnistes = data;
    });
  }

  selectNutritionniste(nutri: any): void {
    this.nutritionnisteSelectionne = nutri;
    this.nutritionnisteId = nutri.id;
    this.loadRdvNutri(nutri.userId ?? nutri.id);
  }

  selectEtOuvrirCalendrier(nutri: any): void {
    this.nutritionnisteSelectionne = nutri;
    this.nutritionnisteId = nutri.id;
    this.loadRdvNutri(nutri.userId ?? nutri.id);
    this.calendarTarget = 'nutritionniste';
    this.showCalendar = true;
    this.selectedDate = null;
    this.selectedSlot = null;
    this.confirmationDone = false;
    this.confirmationError = false;
    this.rdvMotif = '';
    this.buildCalendar();
  }

  loadCoaches(): void {
    this.rdvService.getAllCoaches().subscribe((data: any[]) => {
      this.coaches = data;
    });
  }

  selectCoach(coach: any): void {
    this.coachSelectionne = coach;
    this.coachId = coach.id;
    this.loadRdvCoach(coach.userId ?? coach.id);
  }

  selectEtOuvrirCalendrierCoach(coach: any): void {
    this.coachSelectionne = coach;
    this.coachId = coach.id;
    this.loadRdvCoach(coach.userId ?? coach.id);
    this.calendarTarget = 'coach';
    this.showCalendar = true;
    this.selectedDate = null;
    this.selectedSlot = null;
    this.confirmationDone = false;
    this.confirmationError = false;
    this.rdvMotif = '';
    this.buildCalendar();
  }

  loadPlan(): void {
    if (!this.userId) return;
    this.planLoading = true;
    this.http.get<PlanAlimentaireDetail[]>(`${this.planApi}/user/${this.userId}`, { headers: this.getHeaders() }).subscribe({
      next: (plans) => {
        this.planAlimentaire = plans.length > 0
          ? plans.sort((a, b) =>
            new Date(b.dateCreation).getTime() - new Date(a.dateCreation).getTime()
          )[0]
          : null;
        this.eatenMeals.clear();
        this.updateNutritionPercent();
        this.planLoading = false;
      },
      error: () => { this.planLoading = false; }
    });
  }

  loadProgramme(): void {
    if (!this.userId) return;
    this.programmeLoading = true;
    this.http.get<ProgrammeEntrainement[]>(`${this.programmeApi}/user/${this.userId}`, { headers: this.getHeaders() }).subscribe({
      next: (plans) => {
        this.programmeEntrainement = plans.length > 0
          ? plans.sort((a, b) =>
            new Date(b.dateDebut ?? 0).getTime() - new Date(a.dateDebut ?? 0).getTime()
          )[0]
          : null;
        this.programmeLoading = false;
      },
      error: () => { this.programmeLoading = false; }
    });
  }

  getTotalCalories(): number {
    return this.planAlimentaire?.repas.reduce((s, r) => s + r.calories, 0) ?? 0;
  }

  getAlimentsList(aliments: string | string[] | null | undefined): string[] {
    if (!aliments) return [];
    if (Array.isArray(aliments)) return aliments;
    if (typeof aliments === 'string') {
      return aliments.split(/[,\/;\n]/).map(s => s.trim()).filter(s => s.length > 0);
    }
    return [];
  }

  getRepasIcon(type: string): string {
    const map: Record<string, string> = {
      PETIT_DEJEUNER: '🌅', DEJEUNER: '☀️', COLLATION: '🍎', DINER: '🌙', SNACK: '🍪'
    };
    return map[type] ?? '🍽️';
  }

  getRepasLabel(type: string): string {
    const map: Record<string, string> = {
      PETIT_DEJEUNER: 'Petit-déjeuner', DEJEUNER: 'Déjeuner',
      COLLATION: 'Collation', DINER: 'Dîner', SNACK: 'Snack'
    };
    return map[type] ?? type;
  }

  getExerciceCategorie(ex: Exercice): string {
    if ((ex.dureeSecondes ?? 0) >= 120) return 'Cardio';
    if ((ex.series ?? 0) >= 3) return 'Force';
    return 'Général';
  }

  goTo(section: any): void {
    this.activeSection = section;
  }

  openCalendarFor(target: 'nutritionniste' | 'coach'): void {
    if (target === 'nutritionniste' && !this.nutritionnisteSelectionne) {
      this.activeSection = 'rdv-nutritionniste';
      return;
    }
    if (target === 'coach' && !this.coachSelectionne) {
      this.activeSection = 'rdv-coach';
      return;
    }
    this.calendarTarget = target;
    this.showCalendar = true;
    this.selectedDate = null;
    this.selectedSlot = null;
    this.confirmationDone = false;
    this.confirmationError = false;
    this.rdvMotif = '';
    this.buildCalendar();
  }

  closeCalendar(): void {
    this.showCalendar = false;
  }

  buildCalendar(): void {
    const firstDay = new Date(this.calendarYear, this.calendarMonth, 1).getDay();
    const offset = (firstDay + 6) % 7;
    const daysInMonth = new Date(this.calendarYear, this.calendarMonth + 1, 0).getDate();
    this.calendarDays = [];
    for (let i = 0; i < offset; i++) this.calendarDays.push(null);
    for (let d = 1; d <= daysInMonth; d++) this.calendarDays.push(d);
  }

  prevMonth(): void {
    if (this.calendarMonth === 0) { this.calendarMonth = 11; this.calendarYear--; }
    else { this.calendarMonth--; }
    this.buildCalendar();
  }

  nextMonth(): void {
    if (this.calendarMonth === 11) { this.calendarMonth = 0; this.calendarYear++; }
    else { this.calendarMonth++; }
    this.buildCalendar();
  }

  selectDay(day: number | null): void {
    if (!day || this.isPastDay(day) || this.isWeekend(day)) return;
    this.selectedDate = new Date(this.calendarYear, this.calendarMonth, day);
    this.selectedSlot = null;
  }

  selectSlot(slot: string): void {
    if (!this.isSlotTaken(slot)) this.selectedSlot = slot;
  }

  confirmRdv(): void {
    if (this.confirmingRdv) return;
    if (!this.selectedDate || !this.selectedSlot || !this.rdvMotif.trim()) return;

    this.confirmingRdv = true;

    const [h, m] = this.selectedSlot.split(':');
    const d = new Date(this.selectedDate);
    d.setHours(+h, +m, 0, 0);

    const dateHeure = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;

    const nutriId = this.nutritionnisteSelectionne?.id ?? this.nutritionnisteId;

    const rdv: any = {
      userId: String(this.userId),
      typeIntervenant: this.calendarTarget === 'nutritionniste' ? 'NUTRITIONNISTE' : 'COACH',
      dateHeure,
      motif: this.rdvMotif.trim(),
      dureeMinutes: 30,
      statut: 'EN_ATTENTE'
    };

    if (this.calendarTarget === 'nutritionniste') {
      rdv.nutritionnisteId = String(nutriId);
    } else {
      rdv.coachId = String(this.coachSelectionne?.id ?? this.coachId);
    }

    // Optimistic update — show the new RDV immediately without waiting for reload
    const optimisticRdv: RendezVous = { ...rdv, id: Date.now() } as any;
    if (this.calendarTarget === 'nutritionniste') {
      this.rdvNutriEnAttente = [...this.rdvNutriEnAttente, optimisticRdv];
      this.takenSlotsNutri = [...this.takenSlotsNutri, { date: dateHeure.substring(0, 10), heure: this.selectedSlot }];
    } else {
      this.rdvCoachEnAttente = [...this.rdvCoachEnAttente, optimisticRdv];
      this.takenSlotsCoach = [...this.takenSlotsCoach, { date: dateHeure.substring(0, 10), heure: this.selectedSlot }];
    }
    this.confirmationDone = true;
    this.confirmationError = false;
    this.confirmingRdv = false;

    this.rdvService.create(rdv).subscribe({
      next: (saved) => {
        // Replace optimistic entry with real one from server
        if (this.calendarTarget === 'nutritionniste') {
          this.rdvNutriEnAttente = this.rdvNutriEnAttente.map(r => r.id === optimisticRdv.id ? saved : r);
          this.loadRdvNutri(nutriId);
        } else {
          this.rdvCoachEnAttente = this.rdvCoachEnAttente.map(r => r.id === optimisticRdv.id ? saved : r);
          this.loadRdvCoach(this.coachSelectionne?.id ?? this.coachId);
        }
      },
      error: () => {
        // Rollback optimistic update on failure
        if (this.calendarTarget === 'nutritionniste') {
          this.rdvNutriEnAttente = this.rdvNutriEnAttente.filter(r => r.id !== optimisticRdv.id);
        } else {
          this.rdvCoachEnAttente = this.rdvCoachEnAttente.filter(r => r.id !== optimisticRdv.id);
        }
        this.confirmationError = true;
      }
    });
  }

  resetCalendar(): void {
    this.selectedDate = null;
    this.selectedSlot = null;
    this.confirmationDone = false;
    this.confirmationError = false;
    this.rdvMotif = '';
  }

  isToday(day: number | null): boolean {
    if (!day) return false;
    const t = new Date();
    return day === t.getDate() &&
      this.calendarMonth === t.getMonth() &&
      this.calendarYear === t.getFullYear();
  }

  isPastDay(day: number | null): boolean {
    if (!day) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(this.calendarYear, this.calendarMonth, day) < today;
  }

  isWeekend(day: number | null): boolean {
    if (!day) return false;
    const dow = new Date(this.calendarYear, this.calendarMonth, day).getDay();
    return dow === 0 || dow === 6;
  }

  isSelectedDay(day: number | null): boolean {
    if (!day || !this.selectedDate) return false;
    return day === this.selectedDate.getDate() &&
      this.calendarMonth === this.selectedDate.getMonth() &&
      this.calendarYear === this.selectedDate.getFullYear();
  }

  isSlotTaken(slot: string): boolean {
    if (!this.selectedDate) return false;
    const dateStr = this.fmtDate(this.selectedDate);
    const taken = this.calendarTarget === 'nutritionniste' ? this.takenSlotsNutri : this.takenSlotsCoach;
    return taken.some(t => t.date === dateStr && t.heure === slot);
  }

  fmtDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  fmtSelectedDate(): string {
    if (!this.selectedDate) return '';
    return this.selectedDate.toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  getImcPercent(): string {
    const valStr = this.getImcValue();
    if (valStr === '—') return '0%';
    const val = parseFloat(valStr);
    const pct = Math.min(Math.max(((val - 16) / 24) * 100, 0), 100);
    return `${pct.toFixed(1)}%`;
  }

  getImcLabel(): string {
    const valStr = this.getImcValue();
    if (valStr === '—') return '';
    const v = parseFloat(valStr);
    if (v < 18.5) return 'Insuffisance pondérale';
    if (v < 25) return 'Poids normal ✓';
    if (v < 30) return 'Surpoids';
    return 'Obésité';
  }

  get totalRdvNutri(): number {
    return this.rdvNutriEnAttente.length + this.rdvNutriConfirmes.length + this.rdvNutriRefuses.length;
  }

  get totalRdvCoach(): number {
    return this.rdvCoachEnAttente.length + this.rdvCoachConfirmes.length + this.rdvCoachRefuses.length;
  }
  addWater(): void {
    this.suiviService.incrementEau(this.userId).subscribe({
      next: (data: any) => {
        this.dailyStats.water = data.nb_coupes_bues;
        this.hasDailyData = true;
      }
    });
  }

  addExercice(): void {
    this.suiviService.incrementExercice(this.userId).subscribe({
      next: (data: any) => {
        this.dailyStats.activity = data.nb_exercices_faites;
        this.hasDailyData = true;
      }
    });
  }

  sleepInput: number | null = null;

  logSleep(): void {
    if (this.sleepInput !== null && this.sleepInput >= 0) {
      this.suiviService.updateSommeil(this.userId, this.sleepInput).subscribe({
        next: (data: any) => {
          this.dailyStats.sleep = data.nb_heures_sommeil;
          this.sleepInput = null;
          this.hasDailyData = true;
        }
      });
    }
  }


  // Track eaten meals for today
  eatenMeals: Set<number> = new Set();

  toggleMealEaten(repasId: number): void {
    if (this.eatenMeals.has(repasId)) {
      this.eatenMeals.delete(repasId);
    } else {
      this.eatenMeals.add(repasId);
    }
    this.updateNutritionPercent();
  }

  updateNutritionPercent(): void {
    if (!this.planAlimentaire || this.planAlimentaire.repas.length === 0) {
      this.dailyStats.nutrition = 0;
      return;
    }
    const total = this.planAlimentaire.repas.length;
    const eaten = this.eatenMeals.size;
    this.dailyStats.nutrition = Math.round((eaten / total) * 100);
  }

  isMealEaten(repasId: number): boolean {
    return this.eatenMeals.has(repasId);
  }

  activeParamsTab: 'compte' | 'securite' | 'notifs' | 'prefs' = 'compte';
  paramSuccess = '';
  paramError = '';

  passwordForm = {
    nouveau: '',
    confirmer: ''
  };

  notifPrefs = {
    emailRdv: true,
    emailMessage: true,
    emailRapport: false,
    smsRdv: false,
    smsMessage: false
  };

  displayPrefs = {
    langue: 'fr',
    theme: 'light'
  };

  previewTheme = 'light';
  previewLangue = 'fr';

  setParamsTab(tab: 'compte' | 'securite' | 'notifs' | 'prefs'): void {
    this.activeParamsTab = tab;
    this.paramSuccess = '';
    this.paramError = '';
  }

  savePassword(): void {
    this.paramError = '';
    if (!this.passwordForm.nouveau || !this.passwordForm.confirmer) {
      this.paramError = 'Veuillez remplir tous les champs.'; return;
    }
    if (this.passwordForm.nouveau !== this.passwordForm.confirmer) {
      this.paramError = 'Les mots de passe ne correspondent pas.'; return;
    }
    if (this.passwordForm.nouveau.length < 8) {
      this.paramError = 'Minimum 8 caractères.'; return;
    }
    const email = this.profile.email || localStorage.getItem('email') || '';
    this.http.post('/api/auth/reset-password', {
      email,
      newPassword: this.passwordForm.nouveau
    }, { headers: this.getHeaders() }).subscribe({
      next: () => {
        this.paramSuccess = 'Mot de passe modifié avec succès !';
        this.passwordForm = { nouveau: '', confirmer: '' };
        setTimeout(() => this.paramSuccess = '', 3000);
      },
      error: (err) => {
        this.paramError = err.error?.error || 'Erreur lors de la modification.';
      }
    });
  }

  saveNotifs(): void {
    this.paramSuccess = 'Préférences de notifications enregistrées !';
    setTimeout(() => this.paramSuccess = '', 3000);
  }

  onThemeChange(value: string): void {
    this.previewTheme = value;
    this.displayPrefs.theme = value;
    localStorage.setItem('patientTheme', value);
  }

  onLangueChange(value: string): void {
    this.previewLangue = value;
    this.displayPrefs.langue = value;
  }

  savePrefs(): void {
    this.paramSuccess = 'Préférences enregistrées !';
    setTimeout(() => this.paramSuccess = '', 3000);
  }

  getMotivationLabel(): string {
    if (this.motivationLevel >= 80) return '🔥 Au top !';
    if (this.motivationLevel >= 50) return '⚡ Motivé';
    return '🌱 Besoin de boost';
  }

  getMotivationQuote(): string {
    if (this.motivationLevel >= 80) return 'Rien ne peut vous arrêter ! Continuez ainsi ! 🔥';
    if (this.motivationLevel >= 50) return 'Bon rythme ! Un petit effort et vous y êtes ! ⚡';
    return "Chaque pas compte. Prenez soin de vous aujourd'hui ! 🌱";
  }

  logout(): void {
    if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/authentification/patient';
    }
  }

}