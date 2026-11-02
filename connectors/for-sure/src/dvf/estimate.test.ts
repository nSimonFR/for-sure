import assert from "node:assert/strict";
import { test } from "node:test";
import { estimate, parseCsv, toSales, MIN_SALES, type Sale } from "./estimate.js";

const HEADER =
  "id_mutation,date_mutation,nature_mutation,valeur_fonciere,adresse_nom_voie,type_local,surface_reelle_bati,nombre_pieces_principales,longitude,latitude";

test("parseCsv handles quoted fields with commas and escaped quotes", () => {
  const rows = parseCsv(`${HEADER}\r\nm1,2025-01-02,Vente,100000,"RUE ""A"", B",Appartement,20,1,2.37,48.86\r\n`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].adresse_nom_voie, 'RUE "A", B');
  assert.equal(rows[0].latitude, "48.86");
});

test("toSales keeps apartment+cellar sales and drops multi-unit or mixed mutations", () => {
  const rows = parseCsv([
    HEADER,
    "m1,2025-01-02,Vente,300000,X,Appartement,30,2,2.37,48.86",
    "m1,2025-01-02,Vente,300000,X,Dépendance,,0,2.37,48.86",
    "m2,2025-01-03,Vente,900000,X,Appartement,30,2,2.37,48.86",
    "m2,2025-01-03,Vente,900000,X,Appartement,40,2,2.37,48.86",
    "m3,2025-01-04,Vente,500000,X,Appartement,30,2,2.37,48.86",
    "m3,2025-01-04,Vente,500000,X,Local industriel. commercial ou assimilé,50,0,2.37,48.86",
    "m4,2025-01-05,Echange,300000,X,Appartement,30,2,2.37,48.86",
    "m5,2025-01-06,Vente,300000,X,Appartement,30,2,,",
  ].join("\n"));
  const sales = toSales(rows);
  assert.deepEqual(sales.map((s) => s.id), ["m1"]);
  assert.equal(sales[0].price / sales[0].surface, 10_000);
});

test("toSales prices on the Carrez surface, unless it's implausible", () => {
  const h = `${HEADER},lot1_surface_carrez,lot2_surface_carrez`;
  const sales = toSales(parseCsv([
    h,
    "m1,2025-01-02,Vente,300000,X,Appartement,30,2,2.37,48.86,28.5,",
    "m2,2025-01-02,Vente,300000,X,Appartement,30,2,2.37,48.86,5,",
    "m3,2025-01-02,Vente,300000,X,Appartement,30,2,2.37,48.86,,",
  ].join("\n")));
  assert.deepEqual(sales.map((s) => s.surface), [28.5, 30, 30]);
});

const at = (i: number, overrides: Partial<Sale> = {}): Sale => ({
  id: `s${i}`, date: "2025-06-01", price: 10_000 * 40, surface: 40, rooms: 2, lat: 48.86, lon: 2.37, ...overrides,
});
const subject = { lat: 48.86, lon: 2.37, surface: 50, rooms: 2, radius: 500 };

test("estimate is the median €/m² times the surface, rounded to 1 000", () => {
  const sales = Array.from({ length: MIN_SALES }, (_, i) => at(i, { price: (9_000 + i * 100) * 40 }));
  const e = estimate(sales, subject)!;
  assert.equal(e.pricePerM2, 9_700);
  assert.equal(e.value, 485_000);
  assert.equal(e.months, 12);
  assert.equal(e.to, "2025-06-01");
});

test("the window ends at the newest sale, so old sales fall out", () => {
  const recent = Array.from({ length: MIN_SALES }, (_, i) => at(i, { date: "2025-12-01" }));
  const old = Array.from({ length: 50 }, (_, i) => at(100 + i, { date: "2024-06-01", price: 1 }));
  assert.equal(estimate([...recent, ...old], subject)!.pricePerM2, 10_000);
});

test("too few comparables widens to 24 months, then to twice the radius", () => {
  const far = Array.from({ length: MIN_SALES }, (_, i) => at(i, { lat: 48.8675 })); // ~830 m north
  const e = estimate([at(99, { date: "2025-12-01" }), ...far], subject)!;
  assert.equal(e.radius, 1000);
  assert.equal(e.months, 24);
});

test("rooms filter drops units more than one room away", () => {
  const studios = Array.from({ length: 40 }, (_, i) => at(i, { rooms: 0, price: 1 }));
  assert.equal(estimate(studios, subject), null);
});

test("comparables are indexed to the level of the newest six months", () => {
  // Nearby sales in Q1 at 9 000 €/m²; the market (far away, still in the index) at 10 000 in H2.
  const q1 = Array.from({ length: MIN_SALES }, (_, i) => at(i, { date: "2025-02-01", price: 9_000 * 40 }));
  const h2 = Array.from({ length: 30 }, (_, i) => at(100 + i, { date: "2025-11-01", lat: 49.5 }));
  const e = estimate([...q1, ...h2], subject)!;
  assert.equal(e.pricePerM2, 10_000);
  assert.equal(e.indexed, 1.111);
});
