import type { AdminRole } from '@desert-web/shared';

export const ROLE_LABELS: Record<AdminRole, string> = {
  owner: 'Savininkas',
  staff: 'Darbuotojas',
};

/** createAdminAction atsakymas formai. */
export interface CreateAdminState {
  error?: string;
  /** Laukų klaidos: email, password, passwordRepeat, role. */
  fieldErrors?: Record<string, string>;
  /** Sukurto admino el. paštas (sėkmės pranešimui). */
  createdEmail?: string;
  /** Įvestos reikšmės, kad po klaidos nereikėtų jų vesti iš naujo (slaptažodžiai negrąžinami). */
  values?: { email: string; role: string };
  /** Pateikimų skaičius: formos `key`, kad po kiekvieno atsakymo ji būtų perpiešta. */
  attempt?: number;
}
