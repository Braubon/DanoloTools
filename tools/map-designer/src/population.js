// Estimación de población.
// Supuestos (aproximados, basados en estimaciones habituales para ciudades
// europeas bajomedievales):
//  · Un hogar urbano medio ≈ 4,5 personas (familia nuclear + algún criado/aprendiz).
//  · Una vivienda familiar ocupa ≈ 60 m² útiles; las casas urbanas tenían 2 plantas
//    de media en el centro denso (1–1,5 en los arrabales).
//  · Edificios muy grandes (> 400 m²) se tratan como públicos/religiosos: 1 hogar por cada 200 m².
//  · Granjas y molinos: 1 hogar de ≈ 6 personas (familia + jornaleros) por casa.
//  · Templo y ayuntamiento: 2 hogares (clero, funcionarios). Mercado: nadie vive en él.
//  · Cuarteles: guarnición de ≈ 1 soldado por cada 8 m².
//  · Población sin hogar fijo (mendigos, jornaleros, transeúntes): ≈ 10 % adicional.
export const PERSONS_PER_HOUSEHOLD = 4.5;
export const M2_PER_HOUSEHOLD = 60;
export const HOMELESS_RATE = 0.1;

export function estimate(buildings) {
  let households = 0, farmPeople = 0, n = 0;
  for (const b of buildings) {
    n++;
    if (b.kind === 'farm' || b.kind === 'mill' || b.kind === 'windmill') { farmPeople += 6; continue; }
    if (b.kind === 'market') continue;
    if (b.kind === 'temple' || b.kind === 'hall') { households += 2; continue; }
    if (b.kind === 'barracks') { farmPeople += Math.round((b.area || 300) / 8); continue; } // guarnición: ~1 soldado / 8 m²
    const A = b.area || 0;
    if (b.kind === 'keep' || A > 400) { households += Math.max(2, Math.round(A / 200)); continue; }
    const floors = 1 + Math.min(1.2, Math.max(0, (b.d ?? 0.6) * 1.4));
    households += Math.max(1, Math.round((A * floors) / M2_PER_HOUSEHOLD));
  }
  const housed = households * PERSONS_PER_HOUSEHOLD + farmPeople;
  const homeless = housed * HOMELESS_RATE;
  return { buildings: n, households: households + farmPeople / 6, housed: Math.round(housed), homeless: Math.round(homeless), total: Math.round(housed + homeless) };
}
