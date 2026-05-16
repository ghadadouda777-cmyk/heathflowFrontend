import { Component, OnInit, NgZone, Inject, PLATFORM_ID, ChangeDetectorRef, AfterViewInit, OnDestroy } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { ChatComponent } from '../../chat/chat.component';
import { NotificationBellComponent } from '../../notification-bell/notification-bell.component';
import { RendezVous } from '../../../interfaces/rendez-vous';
import { Consultation } from '../../../interfaces/consultation';
import { RendezVousService } from '../../services/rendez-vous';
import { ConsultationService } from '../../services/consultation';
import { PatientInfo } from '../../../interfaces/PatientInfo';


export interface RepasForm {
  typeRepas: string;
  nom: string;
  aliments: string;
  calories: number | null;
  proteines: number | null;
  glucides: number | null;
  lipides: number | null;
  notes: string;
}

export interface PlanForm {
  nom: string;
  description: string;
  dateDebut: string;
  dateFin: string;
  caloriesJournalieres: number | null;
  objectif: string;
  repas: RepasForm[];
}

export interface UpcomingRdv extends RendezVous {
  patientNom: any;
  dotColor: string;
  badgeColor: string;
}

@Component({
  selector: 'app-nutritionist-dashboard',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, ChatComponent, NotificationBellComponent],
  templateUrl: './nutritionist-dashboard.html',
  styleUrls: ['./nutritionist-dashboard.css']
})
export class NutritionistDashboard implements OnInit {
private charts: any[] = [];
  rendezVousEnAttente: RendezVous[] = [];
  rendezVousConfirmes: RendezVous[] = [];
  rendezVousRefuses: RendezVous[] = [];
  upcomingRdv: UpcomingRdv[] = [];
patientInfo: PatientInfo | null = null;
patientInfoLoading = false;
  activeTab: 'attente' | 'confirme' | 'refuse' = 'attente';
profileAbonnement = {
  typeAbonnement: ''
};
  nutritionnisteId: string = '';

  consultations: Consultation[] = [];
  selectedConsultation: Consultation | null = null;

  selectedRdv: RendezVous | null = null;

  showModal = false;
  activeModalTab: 'details' | 'plan' = 'details';

  planForm: PlanForm = this.emptyPlan();
  planLoading = false;
  planSuccess = '';
  planError = '';

  showRapportModal = false;
  rapportConsultation: Consultation | null = null;

  activePage: string = 'dashboard';

  selectedPatientId: number | null = null;

  activeParamsTab: 'compte' | 'securite' | 'notifs' | 'prefs' | 'abonnement' = 'compte';
  paramSuccess = '';
  paramError = '';

  profileForm = {
    prenom: '',
    nom: '',
    email: '',
    telephone: '',
    specialite: 'Nutritionniste clinique',
    bio: ''
  };

  passwordForm = {
    ancien: '',
    nouveau: '',
    confirmer: ''
  };

  notifPrefs = {
    emailRdv: true,
    emailMessage: true,
    emailRapport: false,
    smsRdv: true,
    smsMessage: false
  };

  displayPrefs = {
    langue: 'fr',
    theme: 'light'
  };

  previewTheme: string = 'light';
  previewLangue: string = 'fr';

  objectifOptions = [
    'Perte de poids',
    'Prise de masse',
    'Équilibre alimentaire',
    'Diabète / glycémie',
    'Sportif haute performance'
  ];

  repasTypeOptions = [
    'Petit-déjeuner',
    'Collation matin',
    'Déjeuner',
    'Collation après-midi',
    'Dîner'
  ];

  plans: { [userId: string]: any } = {};
  showPlanPage = false;
  selectedRdvForPlan: RendezVous | null = null;
  planSaved: any = null;
rapportSearchQuery: string = '';
filteredRapports: { rdv: RendezVous, plan: any }[] = [];
  showRapportPage = false;
  rapportPlan: any = null;
  rapportRdv: RendezVous | null = null;

  private readonly dotColors = ['dot-sage', 'dot-plum', 'dot-amber', 'dot-rose'];
  private readonly badgeColors = ['badge-sage', 'badge-plum', 'badge-amber', 'badge-rose'];
  private readonly apiUrl = 'http://localhost:8084/api';
  private readonly PREFS_KEY = 'nutripro_prefs';

  constructor(
    private rdvService: RendezVousService,
    private consultationService: ConsultationService,
    private http: HttpClient,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.nutritionnisteId = localStorage.getItem('userId') ?? '';
    console.log('✅ nutritionnisteId =', this.nutritionnisteId);

    const nom = localStorage.getItem('nom') || '';
    const prenom = localStorage.getItem('prenom') || '';
    this.profileForm.nom = nom;
    this.profileForm.prenom = prenom;

    if (!this.nutritionnisteId) {
      this.router.navigate(['/authentification/nutritionist']);
      return;
    }

    this.loadRendezVous();
    this.loadConsultations();
    this.loadPlans();
    this.loadSavedPrefs();
    this.loadAbonnement();
  }

  loadPlans(): void {
    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
    this.http.get<any[]>(`${this.apiUrl}/plans-alimentaires`, { headers })
      .subscribe({
        next: (data) => {
          this.ngZone.run(() => {
            this.plans = {};
            data.forEach(p => {
              if (p.nutritionnisteId === this.nutritionnisteId) {
                this.plans[p.userId] = p;
              }
            });
            this.cdr.detectChanges();
          });
        },
        error: (err) => console.error('Erreur plans:', err)
      });
  }

  getPlanByUserId(userId: any): any {
    return this.plans[String(userId)] ?? null;
  }
changePlan(planId: string): void {
  window.location.href = '/abonnement';
}

loadAbonnement(): void {
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  this.http.get<any>(`${this.apiUrl}/users/${this.nutritionnisteId}`, { headers })
    .subscribe({
      next: (data) => {
        this.ngZone.run(() => {
          this.profileAbonnement.typeAbonnement = data.typeAbonnement ?? '';
          this.cdr.detectChanges();
        });
      },
      error: (err) => console.error('❌ Erreur loadAbonnement:', err)
    });
}
private getRdvParSemaine(): { confirmes: number[], attente: number[], refuses: number[] } {
  const now = new Date();
  const confirmes = [0, 0, 0, 0];
  const attente   = [0, 0, 0, 0];
  const refuses   = [0, 0, 0, 0];

  const allRdv = [
    ...this.rendezVousConfirmes,
    ...this.rendezVousEnAttente,
    ...this.rendezVousRefuses
  ];

  allRdv.forEach(rdv => {
    const date = new Date(rdv.dateHeure);
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    let semIndex = -1;
    if (diffDays >= -6  && diffDays <= 6)  semIndex = 3;
    if (diffDays >= 7   && diffDays <= 13) semIndex = 2;
    if (diffDays >= 14  && diffDays <= 20) semIndex = 1;
    if (diffDays >= 21  && diffDays <= 27) semIndex = 0;
    if (semIndex === -1) return;

    if (rdv.statut === 'CONFIRME') confirmes[semIndex]++;
    else if (rdv.statut === 'EN_ATTENTE') attente[semIndex]++;
    else if (rdv.statut === 'REFUSE') refuses[semIndex]++;
  });

  return { confirmes, attente, refuses };
}
private getConsultationsParMois(): number[] {
  const now = new Date();
  const mois = Array(6).fill(0);

  this.rendezVousConfirmes.forEach(rdv => {
    const date = new Date(rdv.dateHeure);
    if (isNaN(date.getTime())) return;
    const diffMois = (now.getFullYear() - date.getFullYear()) * 12
                   + (now.getMonth() - date.getMonth());
    if (diffMois >= -1 && diffMois <= 5) mois[5 - diffMois]++;
  });

  return mois;
}

private getDerniersMoisLabels(): string[] {
  const labels = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const now = new Date();
  const result = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(labels[d.getMonth()]);
  }
  return result;
}
get rendezVousConfirmesSansDoublons(): RendezVous[] {
  const seen = new Set<any>();
  return this.rendezVousConfirmes.filter(rdv => {
    if (seen.has(rdv.userId)) return false;
    seen.add(rdv.userId);
    return true;
  });
}
initCharts(): void {
  if (!isPlatformBrowser(this.platformId)) return;

  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const textColor = isDark ? '#9499b0' : '#6b7280';

  this.charts.forEach(c => c.destroy());
  this.charts = [];

  const semaines = this.getRdvParSemaine();

  const rdvEl = document.getElementById('rdvChart') as HTMLCanvasElement;
  if (rdvEl) {
    this.charts.push(new (window as any).Chart(rdvEl, {
      type: 'bar',
      data: {
        labels: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'],
        datasets: [
          { label: 'Confirmés', data: semaines.confirmes, backgroundColor: '#185FA5', borderRadius: 4, borderSkipped: false },
          { label: 'En attente', data: semaines.attente,  backgroundColor: '#FAC775', borderRadius: 4, borderSkipped: false },
          { label: 'Refusés',   data: semaines.refuses,   backgroundColor: '#F09595', borderRadius: 4, borderSkipped: false }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: textColor, font: { size: 11 } } },
          y: { stacked: true, grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } }
        }
      }
    }));
  }

  const objEl = document.getElementById('objChart') as HTMLCanvasElement;
  if (objEl) {
    const stats = this.getObjectifsStats();
    this.charts.push(new (window as any).Chart(objEl, {
      type: 'doughnut',
      data: {
        labels: stats.map(s => s.label),
        datasets: [{ data: stats.map(s => s.count), backgroundColor: ['#185FA5', '#3B6D11', '#854F0B', '#993556', '#534AB7'], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false } } }
    }));
  }

  const consultEl = document.getElementById('consultChart') as HTMLCanvasElement;
  if (consultEl) {
    const consultData = this.getConsultationsParMois();
    this.charts.push(new (window as any).Chart(consultEl, {
      type: 'line',
      data: {
        labels: this.getDerniersMoisLabels(),
        datasets: [{
          label: 'Consultations',
          data: consultData,
          borderColor: '#D4537E',
          backgroundColor: 'rgba(212,83,126,0.08)',
          borderWidth: 2,
          pointBackgroundColor: '#D4537E',
          pointRadius: 4,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: textColor, font: { size: 11 } } },
          y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } }
        }
      }
    }));
  }

  const donutEl = document.getElementById('donutChart') as HTMLCanvasElement;
  if (donutEl) {
    const total = this.rendezVousConfirmes.length;
    const avecPlan = Object.keys(this.plans).length;
    const sansPlan = Math.max(0, total - avecPlan);
    this.charts.push(new (window as any).Chart(donutEl, {
      type: 'doughnut',
      data: {
        labels: ['Avec plan', 'Sans plan'],
        datasets: [{ data: [avecPlan, sansPlan], backgroundColor: ['#3B6D11', '#F09595'], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }
    }));
  }
}
get tauxPlans(): number {
  const total = this.rendezVousConfirmes.length;
  if (total === 0) return 0;
  return Math.round((Object.keys(this.plans).length / total) * 100);
}
  ouvrirPagePlan(rdv: RendezVous): void {
  this.selectedRdvForPlan = rdv;
  const existing = this.getPlanByUserId(rdv.userId);
  if (existing) {
    this.planForm = {
      nom: existing.nom,
      description: existing.description,
      dateDebut: existing.dateDebut ?? '',
      dateFin: existing.dateFin ?? '',
      caloriesJournalieres: existing.caloriesJournalieres,
      objectif: existing.objectif,
      repas: existing.repas ?? [this.emptyRepas()]
    };
    this.planSaved = existing;
  } else {
    this.planForm = this.emptyPlan();
    this.planSaved = null;
  }
  this.planSuccess = '';
  this.planError = '';
  this.patientInfo = null;
  this.patientInfoLoading = true;
  this.showPlanPage = true;
  this.activePage = 'plan-page';

  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
this.http.get<PatientInfo>(`${this.apiUrl}/patients/${rdv.userId}`, { headers })    .subscribe({
      next: (data) => {
  this.ngZone.run(() => {
    console.log('✅ patientInfo reçu:', data);
    this.patientInfo = data;
    this.patientInfoLoading = false;
    this.cdr.detectChanges();
  });
},
      error: (err) => {
        this.ngZone.run(() => {
          console.error('❌ Erreur patient info:', err.status);
          this.patientInfoLoading = false; 
          this.cdr.detectChanges();
        });
      },
      complete: () => {
        this.ngZone.run(() => {
          this.patientInfoLoading = false; 
          this.cdr.detectChanges();
        });
      }
    });
}
  fermerPagePlan(): void {
    this.showPlanPage = false;
    this.selectedRdvForPlan = null;
    this.planSaved = null;
    this.activePage = 'dashboard';
  }

  savePlanFromPage(): void {
    if (this.planLoading) return;
    if (!this.planForm.nom.trim()) {
      this.planError = 'Le nom du plan est obligatoire.';
      return;
    }
    if (this.planForm.repas.length === 0) {
      this.planError = 'Ajoutez au moins un repas.';
      return;
    }

    this.planLoading = true;
    this.planError = '';
    this.planSuccess = '';

    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
    const payload = {
      nom: this.planForm.nom,
      description: this.planForm.description,
      dateDebut: this.planForm.dateDebut || null,
      dateFin: this.planForm.dateFin || null,
      caloriesJournalieres: this.planForm.caloriesJournalieres,
      objectif: this.planForm.objectif,
      nutritionnisteId: this.nutritionnisteId,
      userId: this.selectedRdvForPlan?.userId ?? null,
      rendezVousId: this.selectedRdvForPlan?.id ?? null,
      repas: this.planForm.repas
    };

    const existing = this.getPlanByUserId(this.selectedRdvForPlan?.userId);
    const request$ = existing
      ? this.http.put<any>(`${this.apiUrl}/plans-alimentaires/${existing.id}`, payload, { headers })
      : this.http.post<any>(`${this.apiUrl}/plans-alimentaires`, payload, { headers });

    request$.pipe(finalize(() => this.ngZone.run(() => {
      this.planLoading = false;
      this.cdr.detectChanges();
    }))).subscribe({
      next: (saved) => this.ngZone.run(() => {
        this.planSuccess = 'Plan enregistré avec succès !';
        this.planSaved = saved;
        this.loadPlans();
        this.cdr.detectChanges();
      }),
      error: (err) => this.ngZone.run(() => {
        this.planError = err.error?.message || 'Erreur lors de l\'enregistrement.';
      })
    });
  }
buildRapportsList(): void {
  this.filteredRapports = this.rendezVousConfirmes
    .filter(rdv => this.getPlanByUserId(rdv.userId))
    .map(rdv => ({ rdv, plan: this.getPlanByUserId(rdv.userId) }));
}


filterRapports(): void {
  const q = this.rapportSearchQuery.toLowerCase().trim();
  const all = this.rendezVousConfirmes
    .filter(rdv => this.getPlanByUserId(rdv.userId))
    .map(rdv => ({ rdv, plan: this.getPlanByUserId(rdv.userId) }));
  if (!q) {
    this.filteredRapports = all;
    return;
  }
  this.filteredRapports = all.filter(item => {
    const nom = (item.rdv.patientNom || 'patient ' + item.rdv.userId).toLowerCase();
    return nom.includes(q);
  });
}
  ouvrirRapport(rdv: RendezVous): void {
    const plan = this.getPlanByUserId(rdv.userId);
    if (!plan) return;
    this.rapportPlan = plan;
    this.rapportRdv = rdv;
    this.showRapportPage = true;
    this.activePage = 'rapport-page';
  }

  fermerRapport(): void {
    this.showRapportPage = false;
    this.rapportPlan = null;
    this.rapportRdv = null;
    this.activePage = 'dashboard';
  }
  getPatientInitials(rdv: RendezVous): string {
  if (rdv.patientNom) {
    const parts = rdv.patientNom.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  }
  return 'P' + String(rdv.userId).substring(0, 2);
}
get patientsConfirmes(): { id: any, nom: string }[] {
  return this.rendezVousConfirmes.map(r => ({
    id: r.userId,
    nom: r.patientNom || 'Patient #' + r.userId
  }));
}
loadRendezVous(): void {
  console.log('📡 loadRendezVous avec id:', this.nutritionnisteId);
  this.rdvService.getByNutritionniste(this.nutritionnisteId).subscribe({
    next: (data: RendezVous[]) => {
      console.log('📦 RDV reçus:', data);
      this.ngZone.run(() => {
        this.rendezVousEnAttente = data.filter(r => r.statut === 'EN_ATTENTE');
        this.rendezVousConfirmes = data.filter(r => r.statut === 'CONFIRME');
        this.rendezVousRefuses = data.filter(r => r.statut === 'REFUSE');
        this.buildUpcomingRdv(data);
        this.buildRapportsList(); // ← AJOUTE ICI
        this.cdr.detectChanges();
          setTimeout(() => this.initCharts(), 100); // ← AJOUTE ICI

      });
    },
    error: (err: any) => {
      console.error('❌ Erreur loadRendezVous:', err);
    }
  });
}

  loadConsultations(): void {
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    this.http.get<Consultation[]>(
      `${this.apiUrl}/consultations/nutritionniste/${this.nutritionnisteId}`,
      { headers }
    ).subscribe({
      next: (data) => {
        this.ngZone.run(() => {
          this.consultations = data;
          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        console.error('❌ Consultations error:', err.status);
      }
    });
  }

  getConsultationByUserId(userId: any): Consultation | undefined {
    return this.consultations.find(c =>
      String(c.userId).toLowerCase().trim() ===
      String(userId).toLowerCase().trim()
    );
  }

  openPlanModal(rdv: RendezVous): void {
    this.selectedRdv = rdv;
    const existing = this.getConsultationByUserId(rdv.userId);
    if (existing) {
      this.openConsultation(existing.id);
    } else {
      this.ngZone.run(() => {
        this.selectedConsultation = null;
        this.showModal = true;
        this.activeModalTab = 'plan';
        this.planForm = this.emptyPlan();
        this.planSuccess = '';
        this.planError = '';
        this.cdr.detectChanges();
      });
    }
  }

private buildUpcomingRdv(all: RendezVous[]): void {
  const now = new Date();
  const monthAgo = new Date(now);
  monthAgo.setDate(now.getDate() - 30);
  const monthAhead = new Date(now);
  monthAhead.setDate(now.getDate() + 30);

  this.upcomingRdv = all
    .filter(r => {
      const d = new Date(r.dateHeure);
      return d >= monthAgo && d <= monthAhead
        && (r.statut === 'CONFIRME' || r.statut === 'EN_ATTENTE'); // ← هنا
    })
    .sort((a, b) => new Date(b.dateHeure).getTime() - new Date(a.dateHeure).getTime())
    .slice(0, 6)
    .map((rdv, i) => ({
      ...rdv,
      dotColor: this.dotColors[i % this.dotColors.length],
      badgeColor: this.badgeColors[i % this.badgeColors.length]
    }));
}

 setPage(page: string): void {
  this.activePage = page;
  this.paramSuccess = '';
  this.paramError = '';
  if (page === 'params') {
    this.previewTheme = this.displayPrefs.theme;
    this.previewLangue = this.displayPrefs.langue;
  }
  if (page === 'rapports') {
    this.buildRapportsList();
  }
  if (page === 'dashboard') {
    setTimeout(() => this.initCharts(), 100);
  }
}

  goToConversation(): void {
    this.selectedPatientId = null;
    this.activePage = 'conv';
  }

  openConversation(userId: any): void {
    this.selectedPatientId = userId;
    this.activePage = 'conv';
  }

  setParamsTab(tab: 'compte' | 'securite' | 'notifs' | 'prefs'| 'abonnement'): void {
    this.activeParamsTab = tab;
    this.paramSuccess = '';
    this.paramError = '';
    if (tab === 'prefs') {
      this.previewTheme = this.displayPrefs.theme;
      this.previewLangue = this.displayPrefs.langue;
    }
  }

  saveProfile(): void {
    this.paramSuccess = 'Profil mis à jour avec succès !';
    this.paramError = '';
    setTimeout(() => this.paramSuccess = '', 3000);
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
  const email = this.profileForm.email || localStorage.getItem('email') || '';
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  this.http.post(`${this.apiUrl}/auth/reset-password`, {
    email: email,
    newPassword: this.passwordForm.nouveau
  }, { headers }).subscribe({
    next: () => {
      this.paramSuccess = 'Mot de passe modifié avec succès !';
      this.passwordForm = { ancien: '', nouveau: '', confirmer: '' };
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
getSansPlan(): RendezVous[] {
  return this.rendezVousConfirmes.filter(rdv => !this.getPlanByUserId(rdv.userId));
}

getObjectifsStats(): { label: string, count: number }[] {
  const map: { [key: string]: number } = {};
  this.rendezVousConfirmes.forEach(rdv => {
    const plan = this.getPlanByUserId(rdv.userId);
    const label = plan?.objectif || rdv.motif || 'Non défini';
    map[label] = (map[label] || 0) + 1;
  });
  return Object.entries(map).map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}
 loadSavedPrefs(): void {
  if (!isPlatformBrowser(this.platformId)) return;
  try {
    const saved = localStorage.getItem(this.PREFS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      this.displayPrefs = { ...this.displayPrefs, ...parsed };
    }
  } catch (e) { }
  this.displayPrefs.theme = 'light';
  this.applyTheme('light');
  this.applyLangue(this.displayPrefs.langue);
  this.previewTheme = 'light';
  this.previewLangue = this.displayPrefs.langue;
}

  onThemeChange(value: string): void {
    this.previewTheme = value;
    this.displayPrefs.theme = value;
    this.applyTheme(value);
  }

  onLangueChange(value: string): void {
    this.previewLangue = value;
    this.displayPrefs.langue = value;
    this.applyLangue(value);
  }

  savePrefs(): void {
    this.displayPrefs.theme = this.previewTheme;
    this.displayPrefs.langue = this.previewLangue;
    try {
      localStorage.setItem(this.PREFS_KEY, JSON.stringify(this.displayPrefs));
    } catch (e) {
      this.paramError = 'Impossible de sauvegarder les préférences.';
      return;
    }
    this.applyTheme(this.displayPrefs.theme);
    this.applyLangue(this.displayPrefs.langue);
    this.paramSuccess = 'Préférences enregistrées avec succès !';
    this.paramError = '';
    setTimeout(() => this.paramSuccess = '', 3000);
  }

  private applyTheme(theme: string): void {
  if (!isPlatformBrowser(this.platformId)) return;
  const root = document.documentElement;
  let isDark = theme === 'dark'; // 'auto' ignoré → toujours light par défaut
  root.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

  private applyLangue(langue: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    document.documentElement.setAttribute('lang', langue);
  }

  logout(): void {
    if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
      localStorage.clear();
      sessionStorage.clear();
      this.router.navigate(['/authentification/nutritionist']);
    }
  }

  accepter(id: number): void {
    this.rdvService.accepter(id).subscribe(() => this.loadRendezVous());
  }

  refuser(id: number): void {
    this.rdvService.refuser(id).subscribe(() => this.loadRendezVous());
  }

  setTab(tab: 'attente' | 'confirme' | 'refuse'): void {
    this.activeTab = tab;
  }

  openRapport(consultationId: number): void {
    this.consultationService.getById(consultationId).subscribe((data: Consultation) => {
      this.ngZone.run(() => {
        this.rapportConsultation = data;
        this.showRapportModal = true;
        this.cdr.detectChanges();
      });
    });
  }

  closeRapportModal(): void {
    this.ngZone.run(() => {
      this.showRapportModal = false;
      this.rapportConsultation = null;
      this.cdr.detectChanges();
    });
  }

  printRapport(): void { window.print(); }

  openConsultation(id: number): void {
    this.consultationService.getById(id).subscribe((data: Consultation) => {
      this.ngZone.run(() => {
        this.selectedConsultation = data;
        this.showModal = true;
        this.activeModalTab = 'details';
        this.planForm = this.emptyPlan();
        this.planSuccess = '';
        this.planError = '';
        this.cdr.detectChanges();
      });
    });
  }

  closeModal(): void {
    this.ngZone.run(() => {
      this.showModal = false;
      this.selectedConsultation = null;
      this.selectedRdv = null;
      this.cdr.detectChanges();
    });
  }

  setModalTab(tab: 'details' | 'plan'): void { this.activeModalTab = tab; }
  addRepas(): void { this.planForm.repas.push(this.emptyRepas()); }
  removeRepas(index: number): void { this.planForm.repas.splice(index, 1); }

  savePlan(): void {
    if (this.planLoading) return;
    if (!this.planForm.nom.trim()) { this.planError = 'Le nom du plan est obligatoire.'; return; }
    if (this.planForm.repas.length === 0) { this.planError = 'Ajoutez au moins un repas.'; return; }

    this.planLoading = true;
    this.planError = '';
    this.planSuccess = '';

    const payload = {
      nom: this.planForm.nom,
      description: this.planForm.description,
      dateDebut: this.planForm.dateDebut || null,
      dateFin: this.planForm.dateFin || null,
      caloriesJournalieres: this.planForm.caloriesJournalieres,
      objectif: this.planForm.objectif,
      nutritionnisteId: this.nutritionnisteId,
      userId: this.selectedConsultation?.userId ?? this.selectedRdv?.userId ?? null,
      consultationId: this.selectedConsultation?.id ?? null,
      rendezVousId: this.selectedRdv?.id ?? null,
      repas: this.planForm.repas
    };

    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

    this.http.post<any>(`${this.apiUrl}/plans-alimentaires`, payload, { headers })
      .pipe(finalize(() => this.ngZone.run(() => this.planLoading = false)))
      .subscribe({
        next: () => this.ngZone.run(() => {
          this.planSuccess = 'Plan enregistré avec succès !';
          this.planForm = this.emptyPlan();
          this.loadConsultations();
          setTimeout(() => this.closeModal(), 1500);
        }),
        error: (err) => this.ngZone.run(() => {
          this.planError = err.error?.message || err.error?.error || 'Erreur lors de l\'enregistrement.';
        })
      });
  }

  getInitials(userId: any): string { return 'P' + String(userId).substring(0, 4); }

  imcClass(imc: number): string {
    if (imc < 18.5) return 'imc-low';
    if (imc < 25) return 'imc-normal';
    if (imc < 30) return 'imc-overweight';
    return 'imc-obese';
  }

  imcLabel(imc: number): string {
    if (imc < 18.5) return 'Insuffisance pondérale';
    if (imc < 25) return 'Poids normal';
    if (imc < 30) return 'Surpoids';
    return 'Obésité';
  }

  private emptyPlan(): PlanForm {
    return {
      nom: '', description: '', dateDebut: '', dateFin: '',
      caloriesJournalieres: null, objectif: 'Perte de poids',
      repas: [this.emptyRepas()]
    };
  }

  private emptyRepas(): RepasForm {
    return {
      typeRepas: 'Petit-déjeuner', nom: '', aliments: '',
      calories: null, proteines: null, glucides: null, lipides: null, notes: ''
    };
  }
}