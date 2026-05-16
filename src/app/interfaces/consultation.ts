export interface Consultation {
  id: number;
  rendezVousId: number;
  userId: any;
  nutritionnisteId: any;
  coachId?: number;
  poids: number;
  taille: number;
  imc: number;
  objectif: string;
  diagnostic: string;
  recommandations: string;
  notes?: string;
  dateConsultation: string;
  prochainRdv?: string;
  planAlimentaireId?: number;
}