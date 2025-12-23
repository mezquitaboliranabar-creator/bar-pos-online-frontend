function toDate(input: string | Date): Date {
  if (input instanceof Date) return input;
  const s = String(input || "");
  if (!s) return new Date();
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

/* Formato fecha y hora básica para Colombia: dd/MM/yyyy HH:mm */
export function fmtDateTimeCO(input: string | Date): string {
  const d = toDate(input);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/* Devuelve fecha actual en formato YYYY-MM-DD (útil para inputs date) */
export function todayStrCO(): string {
  const d = new Date();
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${year}-${month}-${day}`;
}

/* Devuelve fecha N días atrás en formato YYYY-MM-DD */
export function daysAgoStrCO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${year}-${month}-${day}`;
}

/* Hora HH:mm para usar en inputs datetime-local */
export function fmtTimeCO(input: string | Date | undefined): string {
  const d = input ? toDate(input) : new Date();
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${hours}:${minutes}`;
}
