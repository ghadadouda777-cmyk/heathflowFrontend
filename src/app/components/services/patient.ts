import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Patient {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  dateNaissance?: string;
  sexe?: string;
  telephone?: string;
  adresse?: string;
  typeAbonnement?: string;
  age?: number;
  height?: number;
  weight?: number;
  goal?: string;
  lifestyleLevel?: string;
}

@Injectable({ providedIn: 'root' })
export class PatientService {
  private api = '/api/patients';

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    });
  }

  getById(id: string): Observable<Patient> {
    return this.http.get<Patient>(`${this.api}/${id}`, { headers: this.getHeaders() });
  }

  update(id: string, patient: Partial<Patient>): Observable<Patient> {
    return this.http.put<Patient>(`${this.api}/${id}`, patient, { headers: this.getHeaders() });
  }
}
