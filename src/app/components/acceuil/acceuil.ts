import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

interface RoleData {
  icon: string;
  title: string;
  badge: string;
  color: string;
  desc: string;
  features: string[];
  btn: string;
  routeKey: string;
}

@Component({
  selector: 'app-acceuil',
  imports: [RouterLink],
  templateUrl: './acceuil.html',
  styleUrl: './acceuil.css',
})
export class Acceuil {

  roleModalOpen = false;
  infoModalOpen = false;
  selectedRole: RoleData | null = null;

  private roles: Record<string, RoleData> = {
    nutritionist: {
      icon: '🥗',
      title: 'Nutritionniste',
      badge: 'Professionnel santé',
      color: 'linear-gradient(135deg,#22c55e,#4ade80)',
      desc: 'Gérez vos patients, créez des plans alimentaires personnalisés et suivez leur progression depuis un tableau de bord intuitif.',
      features: [
        'Création de plans alimentaires',
        'Suivi des patients en temps réel',
        'Messagerie sécurisée patient',
        'Historique et rapports détaillés'
      ],
      btn: "S'inscrire en tant que Nutritionniste",
      routeKey: 'inscrire/nutritionist'   // ✅ → /inscrire/nutritionist
    },
    coach: {
      icon: '💪',
      title: 'Coach Sportif',
      badge: 'Professionnel fitness',
      color: 'linear-gradient(135deg,#f97316,#fb923c)',
      desc: "Accompagnez vos élèves avec des programmes d'entraînement sur mesure, des défis et un suivi de performance en temps réel.",
      features: [
        "Programmes d'entraînement personnalisés",
        'Suivi des performances',
        'Défis et classements',
        'Coordination avec les nutritionnistes'
      ],
      btn: "S'inscrire en tant que Coach",
      routeKey: 'inscrire/coach'          // ✅ → /inscrire/coach
    },
    bloomer: {
      icon: '🌸',
      title: 'Bloomer',
      badge: 'Membre',
      color: 'linear-gradient(135deg,#a855f7,#ec4899)',
      desc: 'Rejoignez la communauté HealthFlow, accédez à vos plans personnalisés et progressez aux côtés de professionnels certifiés.',
      features: [
        'Plans repas & entraînement',
        'Suivi de vos objectifs',
        'Communauté et défis',
        'Messagerie avec vos pros'
      ],
      btn: "S'inscrire en tant que Bloomer",
      routeKey: 'inscrire/bloomer'        // ✅ → /inscrire/bloomer
    }
  };

  constructor(private router: Router) {}

  openRole(roleKey: string): void {
    this.selectedRole = this.roles[roleKey] ?? null;
    this.roleModalOpen = true;
  }

  openInfo(): void {
    this.infoModalOpen = true;
  }

  closeModal(type: 'role' | 'info'): void {
    if (type === 'role') this.roleModalOpen = false;
    if (type === 'info') this.infoModalOpen = false;
  }

  onOverlayClick(event: MouseEvent, type: 'role' | 'info'): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.closeModal(type);
    }
  }

  goToInscription(): void {
    if (this.selectedRole) {
      this.roleModalOpen = false;
      this.router.navigate(['/' + this.selectedRole.routeKey]);
    }
  }

  scrollToRoles(): void {
    document.getElementById('roles')?.scrollIntoView({ behavior: 'smooth' });
  }

  scrollToFeatures(): void {
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
  }
}


