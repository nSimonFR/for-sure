// Pure DVF logic: CSV rows → apartment sales → a €/m² median around a point.

export interface Sale {
  id: string;
  date: string;          // YYYY-MM-DD
  price: number;         // valeur_fonciere, whole mutation
  surface: number;       // Carrez when the deed gives one, else surface_reelle_bati
  rooms: number;
  lat: number;
  lon: number;
}

export interface Subject {
  lat: number;
  lon: number;
  surface: number;       // Carrez, as on a deed or listing
  rooms?: number;
  radius: number;        // metres
}

export interface Estimate {
  value: number;         // EUR, rounded to the nearest 1 000
  pricePerM2: number;
  indexed: number;       // time adjustment applied to the comparables' median, e.g. 1.02
  sales: number;
  radius: number;
  months: number;
  from: string;
  to: string;
}

// Below this many comparables a tier is too noisy; widen to the next one.
export const MIN_SALES = 15;

// RFC 4180-ish: quoted fields, "" escapes. geo-dvf only quotes addresses.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }

  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

// One sale per mutation, and only plain apartment sales: exactly one
// "Appartement", plus optional cellars/parking ("Dépendance") or bare parcel
// rows. Multi-unit or mixed (shop, house) mutations price several things at once.
export function toSales(rows: Record<string, string>[]): Sale[] {
  const byMutation = new Map<string, Record<string, string>[]>();
  for (const r of rows) {
    const list = byMutation.get(r.id_mutation);
    if (list) list.push(r);
    else byMutation.set(r.id_mutation, [r]);
  }

  const sales: Sale[] = [];
  for (const [id, group] of byMutation) {
    if (group[0].nature_mutation !== "Vente") continue;
    const apartments = group.filter((r) => r.type_local === "Appartement");
    if (apartments.length !== 1) continue;
    if (group.some((r) => r.type_local && r.type_local !== "Appartement" && r.type_local !== "Dépendance")) continue;

    const apt = apartments[0];
    const bati = Number(apt.surface_reelle_bati);
    const carrez = [1, 2, 3, 4, 5].reduce((sum, i) => sum + (Number(apt[`lot${i}_surface_carrez`]) || 0), 0);
    const sale = {
      id,
      date: apt.date_mutation,
      price: Number(apt.valeur_fonciere),
      // Carrez off by more than 40% is usually a lot from another unit.
      surface: carrez > 0.6 * bati && carrez < 1.4 * bati ? carrez : bati,
      rooms: Number(apt.nombre_pieces_principales),
      lat: Number(apt.latitude),
      lon: Number(apt.longitude),
    };
    if (sale.price > 0 && sale.surface > 0 && apt.latitude && apt.longitude) sales.push(sale);
  }
  return sales;
}

export function distance(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function monthsBefore(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

function quarter(date: string): string {
  return `${date.slice(0, 4)}Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`;
}

// Median €/m² per quarter over every sale given (whole communes, ~1 400 per
// quarter in Paris), and the level of the six months up to `to`. Lets a sale from
// a year ago count at the newest level in the data, not its own.
export function quarterIndex(sales: Sale[], to: string): { level: (date: string) => number; latest: number } {
  const byQuarter = new Map<string, number[]>();
  for (const s of sales) {
    const q = quarter(s.date);
    (byQuarter.get(q) ?? byQuarter.set(q, []).get(q)!).push(s.price / s.surface);
  }
  const levels = new Map([...byQuarter].map(([q, xs]) => [q, median(xs)]));
  const since = monthsBefore(to, 6);
  const latest = median(sales.filter((s) => s.date > since).map((s) => s.price / s.surface));
  return { level: (date) => levels.get(quarter(date)) ?? latest, latest };
}

// The window ends at the newest sale in the data, not today: DVF is published
// with a ~6-month lag, so "the last 12 months" from today can be nearly empty.
export function estimate(sales: Sale[], subject: Subject): Estimate | null {
  if (!sales.length) return null;
  const to = sales.reduce((max, s) => (s.date > max ? s.date : max), "");
  const index = quarterIndex(sales, to);

  const tiers = [
    { radius: subject.radius, months: 12 },
    { radius: subject.radius, months: 24 },
    { radius: subject.radius * 2, months: 24 },
  ];
  for (const tier of tiers) {
    const from = monthsBefore(to, tier.months);
    const comparables = sales.filter((s) =>
      s.date > from &&
      (subject.rooms === undefined || Math.abs(s.rooms - subject.rooms) <= 1) &&
      distance(subject.lat, subject.lon, s.lat, s.lon) <= tier.radius,
    );
    if (comparables.length < MIN_SALES) continue;

    const raw = median(comparables.map((s) => s.price / s.surface));
    const pricePerM2 = Math.round(median(comparables.map((s) => (s.price / s.surface) * (index.latest / index.level(s.date)))));
    return {
      value: Math.round((pricePerM2 * subject.surface) / 1000) * 1000,
      pricePerM2,
      indexed: Math.round((pricePerM2 / raw) * 1000) / 1000,
      sales: comparables.length,
      radius: tier.radius,
      months: tier.months,
      from,
      to,
    };
  }
  return null;
}
