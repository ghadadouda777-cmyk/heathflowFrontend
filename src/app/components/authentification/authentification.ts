import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth-service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-authentification',
  standalone: true,
  imports: [RouterLink, FormsModule, CommonModule],
  templateUrl: './authentification.html',
  styleUrl: './authentification.css',
})
export class Authentification implements OnInit {
  role   = '';
  email  = '';
  pwd    = '';
  loading = false;
  errorMsg = '';

  private route       = inject(ActivatedRoute);
  private router      = inject(Router);
  private authService = inject(AuthService);

  ngOnInit() {
    this.role = this.route.snapshot.params['role'];
    console.log('role =', this.role);
    if (!this.role) {
      this.router.navigate(['/Acceuil']);
    }
  }

  login() {
    if (!this.email || !this.pwd) {
      this.errorMsg = 'Veuillez remplir tous les champs.';
      return;
    }

    this.loading  = true;
    this.errorMsg = '';

    this.authService.login({ email: this.email, pwd: this.pwd, role: this.role.toUpperCase() }).subscribe({
      next: (res) => {
        this.loading = false;
        const userId = this.authService.getUserId();
        const serverRole = (res.role || this.role).toLowerCase();
        
        console.log('✅ Login OK — role =', serverRole, 'userId =', userId);

        if (serverRole === 'nutritionist') {
          this.router.navigate(['/dashboard/nutritionist']);
        } else if (serverRole === 'coach') {
          this.router.navigate(['/dashboard/coach']);
        } else {
          // Bloomer or Patient
          this.router.navigate(['/dashboard/patient', userId]);
        }
      },
   error: (err) => {
  this.loading = false;
  // ← affiche le vrai message du backend
  this.errorMsg = err.error?.error || 'Email ou mot de passe incorrect.';
  console.error(err);
}
    });
  }
}