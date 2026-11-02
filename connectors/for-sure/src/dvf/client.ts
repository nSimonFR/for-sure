import { readFile } from "node:fs/promises";
import { estimate, parseCsv, toSales, type Estimate, type Sale } from "./estimate.js";

const GEOCODER = "https://data.geopf.fr/geocodage";
const DVF = "https://files.data.gouv.fr/geo-dvf/latest/csv";
const TTL_MS = 24 * 60 * 60 * 1000;
// geo-dvf keeps 5 years; the estimate only ever looks back 24 months from the newest sale.
const YEARS_BACK = 3;

export interface Property {
  name: string;
  address: string;
  surface: number;
  rooms?: number;
  radius: number;
  communes?: string[];
}

interface Located { lat: number; lon: number; communes: string[] }

export async function loadProperty(file: string): Promise<Property> {
  const p = JSON.parse(await readFile(file, "utf-8")) as Partial<Property>;
  if (!p.address || !p.surface) throw new Error(`${file}: "address" and "surface" are required`);
  return { name: p.name || "Appartement", radius: 500, ...p } as Property;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json();
}

async function cityAt(lat: number, lon: number): Promise<string | null> {
  const data = await getJson(`${GEOCODER}/reverse?lat=${lat}&lon=${lon}&limit=1`);
  return data.features?.[0]?.properties?.citycode ?? null;
}

// A radius can cross into the next arrondissement/commune, and DVF is filed
// per commune: sample the edge of the widest search circle to find which.
async function locate(p: Property): Promise<Located> {
  const data = await getJson(`${GEOCODER}/search?q=${encodeURIComponent(p.address)}&limit=1`);
  const f = data.features?.[0];
  if (!f) throw new Error(`DVF: address not found: ${p.address}`);
  const [lon, lat] = f.geometry.coordinates as [number, number];
  if (p.communes?.length) return { lat, lon, communes: p.communes };

  const reach = (p.radius * 2) / 111_320;
  const edge = [[reach, 0], [-reach, 0], [0, reach], [0, -reach]].map(([dLat, dLon]) =>
    cityAt(lat + dLat, lon + dLon / Math.cos((lat * Math.PI) / 180)).catch(() => null),
  );
  const codes = new Set([f.properties.citycode as string, ...(await Promise.all(edge))]);
  return { lat, lon, communes: [...codes].filter((c): c is string => !!c) };
}

async function salesFor(commune: string, year: number): Promise<Sale[]> {
  const dep = commune.startsWith("97") ? commune.slice(0, 3) : commune.slice(0, 2);
  const res = await fetch(`${DVF}/${year}/communes/${dep}/${commune}.csv`);
  if (res.status === 404) return []; // year not published yet
  if (!res.ok) throw new Error(`DVF ${year}/${commune} → ${res.status}`);
  return toSales(parseCsv(await res.text()));
}

let located: { key: string; at: Located } | null = null;
let cached: { key: string; at: number; estimate: Estimate } | null = null;

export function lastEstimate(): Estimate | null {
  return cached?.estimate ?? null;
}

export async function getEstimate(p: Property): Promise<Estimate> {
  const key = JSON.stringify(p);
  if (cached?.key === key && Date.now() - cached.at < TTL_MS) return cached.estimate;

  if (located?.key !== key) located = { key, at: await locate(p) };
  const { lat, lon, communes } = located.at;

  const thisYear = new Date().getUTCFullYear();
  const jobs = communes.flatMap((c) =>
    Array.from({ length: YEARS_BACK + 1 }, (_, i) => salesFor(c, thisYear - i)),
  );
  const sales = (await Promise.all(jobs)).flat();

  const e = estimate(sales, { lat, lon, surface: p.surface, rooms: p.rooms, radius: p.radius });
  if (!e) throw new Error(`DVF: not enough comparable sales within ${p.radius * 2} m`);
  console.log(
    `[dvf] ${e.pricePerM2} €/m² × ${p.surface} m² = ${e.value} € ` +
    `(${e.sales} sales, ${e.radius} m, ${e.from}→${e.to}, communes ${communes.join(",")})`,
  );
  cached = { key, at: Date.now(), estimate: e };
  return e;
}
