import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SuiviService } from '../../../services/suivi';
import { ObjectifService} from '../../../services/objectif-personnel';
import { ActivatedRoute, RouterLink } from '@angular/router';

interface Meal {
  name: string;
  type: string;
  quantite: number;
  cal100: number;
  prot100: number;
}

@Component({
  selector: 'app-bloomer-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './bloomer-dashboard.html',
  styleUrl: './bloomer-dashboard.css',
})

export class BloomerDashboard implements OnInit {
userId: string = '';

  water: number = 0;
  sleep: number = 0;
  exo: number = 0;

 
  goalWater: number = 8;
  goalSleep: number = 7;
  goalExo: number = 4;
  goalCal: number = 2000;
  goalProt: number = 150;

calSuivi: number = 0;
protSuivi: number = 0;
  meals: Meal[] = [];
  newMeal: Partial<Meal> = {
    name: '',
    type: 'petit-dej',
    quantite: undefined,
    cal100: undefined,
    prot100: undefined
  };

 
  sleepInput: number | null = null;


  motivationMsg: string = '';

  constructor(
    private suiviService: SuiviService,
    private objectifService: ObjectifService,
     private route: ActivatedRoute ,
      private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
  
     this.route.params.subscribe(params => {
    this.userId = params['userId'];
    console.log('userId récupéré:', this.userId); // ← AJOUTE pour débugger
    if (this.userId) {
      this.loadData();
    }
  });
  }
loadData(): void {
  if (!this.userId) return;


  this.objectifService.getObjectif(this.userId).subscribe({
    next: (data) => {
      this.goalWater = data.objectif_coupes_eau        ?? 8;
      this.goalSleep = data.objectif_heures_sommeil    ?? 7;
      this.goalExo   = data.objectif_exercices_semaine ?? 4;
      this.goalCal   = data.objectif_calories          ?? 2000;
      this.goalProt  = data.objectif_proteines         ?? 150;
       this.cdr.detectChanges(); 

      this.suiviService.getSuiviDuJour(this.userId).subscribe({
        next: (suivi) => {
          this.water = suivi.nb_coupes_bues      ?? 0;
          this.sleep = suivi.nb_heures_sommeil   ?? 0;
          this.exo   = suivi.nb_exercices_faites ?? 0;
          this.calSuivi  = suivi.calories_consommes  ?? 0;
          this.protSuivi = suivi.proteines_consommes ?? 0; 
          this.checkMotivation();
           this.cdr.detectChanges(); 
        },
        error: (err) => console.error('Erreur suivi', err)
      });
    },
    error: (err) => console.error('Erreur objectifs', err)
  });
}
  getPercent(val: number, goal: number): number {
    if (!goal) return 0;
    return Math.min(100, Math.round((val / goal) * 100));
  }

  calcCal(meal: Meal): number {
    return Math.round((meal.quantite * meal.cal100) / 100);
  }

  calcProt(meal: Meal): number {
    return Math.round((meal.quantite * meal.prot100) / 100);
  }

  get totalCalories(): number {
    return this.meals.reduce((sum, meal) => sum + this.calcCal(meal), 0);
  }

  get totalProteines(): number {
    return this.meals.reduce((sum, meal) => sum + this.calcProt(meal), 0);
  }

  getBadgeClass(type: string): string {
    const map: { [key: string]: string } = {
      'petit-dej': 'badge-petit',
      'dejeuner':  'badge-dej',
      'diner':     'badge-din',
      'collation': 'badge-col'
    };
    return map[type] || '';
  }

  getTypeLabel(type: string): string {
    const map: { [key: string]: string } = {
      'petit-dej': 'Petit-dej',
      'dejeuner':  'Déjeuner',
      'diner':     'Dîner',
      'collation': 'Collation'
    };
    return map[type] || type;
  }

  checkMotivation(): void {
    if (this.water >= this.goalWater)
      this.motivationMsg = '💧 Bravo ! Objectif eau atteint aujourd\'hui !';
    else if (this.exo >= this.goalExo)
      this.motivationMsg = '💪 Incroyable ! Objectif exercices atteint cette semaine !';
    else if (this.sleep >= this.goalSleep)
      this.motivationMsg = '😴 Parfait ! Tu as bien dormi cette nuit !';
    else
      this.motivationMsg = '';
  }

 
  addWater(): void {
    this.suiviService.incrementEau(this.userId).subscribe({
      next: (data) => {
        this.water = data.nb_coupes_bues;
        this.checkMotivation();
      },
      error: (err) => console.error('Erreur eau', err)
    });
  }

  addExercice(): void {
    this.suiviService.incrementExercice(this.userId).subscribe({
      next: (data) => {
        this.exo = data.nb_exercices_faites;
        this.checkMotivation();
      },
      error: (err) => console.error('Erreur exercice', err)
    });
  }

  logSleep(): void {
    if (this.sleepInput !== null && this.sleepInput >= 0) {
      const heures = this.sleepInput;
      this.sleep = heures;
      this.sleepInput = null;

      this.suiviService.updateSommeil(this.userId, heures).subscribe({
        next: (data) => {
          this.sleep = data.nb_heures_sommeil;
          this.checkMotivation();
        },
        error: (err) => console.error('Erreur sommeil', err)
      });
    }
  }
addMeal(): void {
  if (this.newMeal.name && this.newMeal.quantite && this.newMeal.cal100 && this.newMeal.prot100) {
    const meal = this.newMeal as Meal;
    const calRepas  = Math.round((meal.quantite * meal.cal100) / 100);
    const protRepas = Math.round((meal.quantite * meal.prot100) / 100);

    // Envoie seulement les valeurs du nouveau repas ← pas le total
    this.suiviService.updateCalories(this.userId, calRepas).subscribe();
    this.suiviService.updateProteines(this.userId, protRepas).subscribe();
this.meals.push({ ...meal });        
this.calSuivi  += calRepas;        
this.protSuivi += protRepas;       
    this.newMeal = {
      name: '', type: 'petit-dej',
      quantite: undefined, cal100: undefined, prot100: undefined
    };
  }
}
  removeMeal(index: number): void {
    this.meals.splice(index, 1);

    this.suiviService.updateCalories(this.userId, this.totalCalories).subscribe();
    this.suiviService.updateProteines(this.userId, this.totalProteines).subscribe();
  }


  updateGoalWater(): void {
    this.objectifService.updateEau(this.userId, this.goalWater).subscribe({
      error: (err) => console.error('Erreur update eau objectif', err)
    });
  }

  updateGoalSleep(): void {
    this.objectifService.updateSommeil(this.userId, this.goalSleep).subscribe({
      error: (err) => console.error('Erreur update sommeil objectif', err)
    });
  }

  updateGoalExo(): void {
    this.objectifService.updateExercices(this.userId, this.goalExo).subscribe({
      error: (err) => console.error('Erreur update exercices objectif', err)
    });
  }
  updateGoalCal(): void {
  if (!this.userId) return;
  this.objectifService.updateCalories(this.userId, this.goalCal).subscribe({
    error: (err) => console.error('Erreur update calories objectif', err)
  });
}



  }