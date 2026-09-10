/**
 * Échéance d'une couverture : date d'effet + durée − 1 jour.
 *
 * Reprend exactement `calculate_expiration_date` du backend
 * (backend/contracts/services.py) pour que l'échéance affichée avant émission
 * soit celle que le contrat portera réellement une fois émis.
 */
export function computeExpirationDate(
  effectDate: string | null | undefined,
  duration: string | number | null | undefined,
  periodicity: string | null | undefined,
): string {
  if (!effectDate || duration === null || duration === undefined || duration === "") return "";
  const match = String(effectDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const count = Number(duration);
  if (!match || !Number.isFinite(count) || count <= 0) return "";

  const start = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const end =
    periodicity === "JOUR"
      ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + count)
      : addMonthsClamped(start, count);
  end.setDate(end.getDate() - 1);

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
}

/** Le 31 janvier + 1 mois donne le 28/29 février, pas le 2 ou 3 mars. */
function addMonthsClamped(value: Date, months: number) {
  const monthIndex = value.getMonth() + months;
  const year = value.getFullYear() + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(value.getDate(), lastDay));
}
