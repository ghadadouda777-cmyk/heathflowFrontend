import { Component, OnInit, NgZone, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { ChatComponent } from '../../chat/chat.component';
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
  imports: [CommonModule, DatePipe, FormsModule, ChatComponent],
  templateUrl: './nutritionist-dashboard.html',
  styleUrls: ['./nutritionist-dashboard.css']
})
export class NutritionistDashboard implements OnInit {

  rendezVousEnAttente: RendezVous[] = [];
  rendezVousConfirmes: RendezVous[] = [];
  rendezVousRefuses: RendezVous[] = [];
  upcomingRdv: UpcomingRdv[] = [];
patientInfo: PatientInfo | null = null;
patientInfoLoading = false;
  activeTab: 'attente' | 'confirme' | 'refuse' = 'attente';

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

  activeParamsTab: 'compte' | 'securite' | 'notifs' | 'prefs' = 'compte';
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

  // ── Variables plan ──
  plans: { [userId: string]: any } = {};
  showPlanPage = false;
  selectedRdvForPlan: RendezVous | null = null;
  planSaved: any = null;
rapportSearchQuery: string = '';
filteredRapports: { rdv: RendezVous, plan: any }[] = [];
  // ── Variables rapport ──
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
  }

  // ── Charge les plans du nutritionniste ──
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

  // ── Récupère plan par userId ──
  getPlanByUserId(userId: any): any {
    return this.plans[String(userId)] ?? null;
  }

  // ── Ouvre page plan ──
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
  this.http.get<PatientInfo>(`${this.apiUrl}/users/${rdv.userId}`, { headers })
    .subscribe({
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
          this.patientInfoLoading = false; // ✅
          this.cdr.detectChanges();
        });
      },
      complete: () => {
        this.ngZone.run(() => {
          this.patientInfoLoading = false; // ✅ garantie finale
          this.cdr.detectChanges();
        });
      }
    });
}
  // ── Ferme page plan ──
  fermerPagePlan(): void {
    this.showPlanPage = false;
    this.selectedRdvForPlan = null;
    this.planSaved = null;
    this.activePage = 'dashboard';
  }

  // ── Sauvegarde plan depuis page dédiée ──
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
  // ── Ouvre rapport ──
  ouvrirRapport(rdv: RendezVous): void {
    const plan = this.getPlanByUserId(rdv.userId);
    if (!plan) return;
    this.rapportPlan = plan;
    this.rapportRdv = rdv;
    this.showRapportPage = true;
    this.activePage = 'rapport-page';
  }

  // ── Ferme rapport ──
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
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() + 30);
    this.upcomingRdv = all
      .filter(r => { const d = new Date(r.dateHeure); return d >= now && d <= weekEnd; })
      .sort((a, b) => new Date(a.dateHeure).getTime() - new Date(b.dateHeure).getTime())
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
    this.buildRapportsList(); // ← AJOUTE ICI
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

  setParamsTab(tab: 'compte' | 'securite' | 'notifs' | 'prefs'): void {
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
    this.applyTheme(this.displayPrefs.theme);
    this.applyLangue(this.displayPrefs.langue);
    this.previewTheme = this.displayPrefs.theme;
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
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    let isDark = theme === 'dark' || (theme === 'auto' && prefersDark);
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