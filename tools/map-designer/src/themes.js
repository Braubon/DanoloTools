// Temas de color. Cada tema define unos colores base; el resto se deriva.
import { PAL } from './render.js';

// Colores editables en el tema personalizado
export const EDITABLE = [
  ['paper', 'Terreno'],
  ['street', 'Calles y caminos'],
  ['building', 'Tejados'],
  ['buildingAlt', 'Tejados (variación)'],
  ['keep', 'Edificios nobles'],
  ['ink', 'Contornos y murallas'],
  ['water', 'Agua'],
  ['waterEdge', 'Orilla'],
  ['tree', 'Árboles'],
  ['forest', 'Suelo de bosque'],
  ['field', 'Campos'],
  ['huerta', 'Huertas'],
  ['cliffFace', 'Cantil de riscos'],
  ['plateau', 'Meseta'],
  ['wood', 'Madera / muelles'],
];

export const THEMES = [
  { id: 'pergamino', name: 'Pergamino', base: {
    paper: '#E8E1CF', street: '#F5F0E4', building: '#C8BCA3', buildingAlt: '#BFB298', keep: '#A99C82', ink: '#37312A',
    water: '#A8BDC1', waterEdge: '#6F8387', tree: '#ADB38B', forest: '#DAD9BF', field: '#E2DAC2', huerta: '#CDD0AE',
    cliffFace: '#B3A790', plateau: '#F2EDE1', wood: '#C4AE88' } },
  { id: 'teja', name: 'Tejados rojos', base: {
    paper: '#EDE3CC', street: '#F8F1E1', building: '#C9765A', buildingAlt: '#B8654B', keep: '#9E5A43', ink: '#3E2A22',
    water: '#8FB7BD', waterEdge: '#557C83', tree: '#9DAE73', forest: '#DCDDB5', field: '#E8D7AE', huerta: '#C9CF9C',
    cliffFace: '#C2A982', plateau: '#F4EBD8', wood: '#B98F62' } },
  { id: 'pizarra', name: 'Pizarra atlántica', base: {
    paper: '#DCDED5', street: '#EEF0EA', building: '#646A72', buildingAlt: '#565C64', keep: '#4A4F57', ink: '#1F2328',
    water: '#89A6B2', waterEdge: '#4E6B78', tree: '#7E9878', forest: '#C7D1BE', field: '#D3D8C4', huerta: '#B8C7A6',
    cliffFace: '#9CA19A', plateau: '#E8EAE3', wood: '#8F7E68' } },
  { id: 'nieve', name: 'Nieve', base: {
    paper: '#EEF2F5', street: '#FFFFFF', building: '#F7F9FB', buildingAlt: '#E3E9EF', keep: '#C9D3DD', ink: '#3D4B59',
    water: '#A9C8D8', waterEdge: '#6A8FA5', tree: '#6F8D80', forest: '#D9E3E2', field: '#E4E9EC', huerta: '#D6DED9',
    cliffFace: '#AEB9C2', plateau: '#F8FAFC', wood: '#9C8A76' } },
  { id: 'desierto', name: 'Desierto', base: {
    paper: '#E8D2A6', street: '#F4E4C1', building: '#DDBE8E', buildingAlt: '#D1AE7B', keep: '#C49A62', ink: '#6A4528',
    water: '#5FB2B5', waterEdge: '#2F7F84', tree: '#8FA35A', forest: '#D8D19A', field: '#E3C88F', huerta: '#B9C07A',
    cliffFace: '#C9A26B', plateau: '#F1E0BC', wood: '#B88A57' } },
  { id: 'selva', name: 'Selva tropical', base: {
    paper: '#D3DBAE', street: '#E9EBC9', building: '#C2955E', buildingAlt: '#AE8350', keep: '#8F6A40', ink: '#33301F',
    water: '#5FA49B', waterEdge: '#2E6F67', tree: '#5F8B47', forest: '#A6BC7E', field: '#CBD497', huerta: '#9FB86E',
    cliffFace: '#A49B72', plateau: '#E3E7C6', wood: '#9D7A4D' } },
  { id: 'turba', name: 'Tejados de turba', base: {
    paper: '#D8D5C1', street: '#E9E7D8', building: '#8D9A68', buildingAlt: '#7F8C5C', keep: '#7D6F59', ink: '#2E2A22',
    water: '#9AB1B6', waterEdge: '#5F777D', tree: '#738867', forest: '#C3C8AA', field: '#D2CDAE', huerta: '#B3BA92',
    cliffFace: '#A39B85', plateau: '#E6E4D5', wood: '#8A7357' } },
  { id: 'otono', name: 'Otoño', base: {
    paper: '#E7DAC0', street: '#F4EBD8', building: '#B9875D', buildingAlt: '#A8764C', keep: '#8B5E3C', ink: '#3B2A1E',
    water: '#93AFB0', waterEdge: '#5A7677', tree: '#CB8B42', forest: '#E1C796', field: '#E3CB92', huerta: '#C9BE7E',
    cliffFace: '#B79E7B', plateau: '#F2E9D6', wood: '#A47C55' } },
  { id: 'pantano', name: 'Pantano', base: {
    paper: '#C8C8A4', street: '#DAD9BB', building: '#8C7D60', buildingAlt: '#7C6E53', keep: '#6B5E46', ink: '#2B2A20',
    water: '#748669', waterEdge: '#48573F', tree: '#6A7651', forest: '#A9AE86', field: '#C1C096', huerta: '#A3AA79',
    cliffFace: '#9C9779', plateau: '#D9D9BC', wood: '#7C6A4E' } },
  { id: 'elfico', name: 'Mármol élfico', base: {
    paper: '#E3EADF', street: '#F6F8F3', building: '#F3F1EA', buildingAlt: '#E7E4DA', keep: '#D7CFBE', ink: '#4F5C55',
    water: '#A3CBD0', waterEdge: '#5F8F95', tree: '#97B98A', forest: '#CFDDC4', field: '#DDE5CF', huerta: '#BFD3AD',
    cliffFace: '#B5BDB2', plateau: '#F1F5EE', wood: '#B8A585' } },
  { id: 'cobre', name: 'Cúpulas de cobre', base: {
    paper: '#DAD3C4', street: '#EEEADF', building: '#72A596', buildingAlt: '#609386', keep: '#B7804F', ink: '#2B2A28',
    water: '#94AFB8', waterEdge: '#587680', tree: '#93A47B', forest: '#CED0B6', field: '#DDD3B7', huerta: '#BDC6A1',
    cliffFace: '#A99F8C', plateau: '#EAE5DA', wood: '#A88A64' } },
  { id: 'volcan', name: 'Ceniza y lava', base: {
    paper: '#4A4440', street: '#5C5550', building: '#827670', buildingAlt: '#73685F', keep: '#9A6A52', ink: '#161210',
    water: '#C8562D', waterEdge: '#7C2A12', tree: '#5D6650', forest: '#555046', field: '#57514A', huerta: '#5F6352',
    cliffFace: '#2C2724', plateau: '#544D48', wood: '#6E5A48' } },
  { id: 'noche', name: 'Nocturno', base: {
    paper: '#232A36', street: '#303949', building: '#55607A', buildingAlt: '#4A546B', keep: '#7A6F5A', ink: '#0B0E14',
    water: '#1E3550', waterEdge: '#0F1E30', tree: '#3E5A4C', forest: '#2C3A39', field: '#2C3440', huerta: '#33433D',
    cliffFace: '#161B24', plateau: '#2B3340', wood: '#6B5A45' } },
  { id: 'tinta', name: 'Tinta (B/N)', base: {
    paper: '#FFFFFF', street: '#FFFFFF', building: '#E4E4E4', buildingAlt: '#D9D9D9', keep: '#C4C4C4', ink: '#111111',
    water: '#D6D6D6', waterEdge: '#555555', tree: '#CFCFCF', forest: '#F1F1F1', field: '#F7F7F7', huerta: '#E8E8E8',
    cliffFace: '#9E9E9E', plateau: '#FFFFFF', wood: '#BDBDBD' } },
];

// --- utilidades de color ---
const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
export const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };

export function derive(base) {
  const b = { ...THEMES[0].base, ...base };
  return {
    ...b,
    block: b.paper,
    roadEdge: mix(b.paper, b.ink, 0.3),
    treeEdge: mix(b.tree, b.ink, 0.5),
    field2: mix(b.field, b.ink, 0.05),
    furrow: mix(b.field, b.ink, 0.16),
    huertaRow: mix(b.huerta, b.ink, 0.3),
    fence: mix(b.paper, b.ink, 0.45),
    cliff: mix(b.cliffFace, b.ink, 0.55),
    cliffFoot: mix(b.cliffFace, b.ink, 0.3),
    boat: mix(b.wood, b.paper, 0.45),
    sand: mix(b.paper, '#F0D79A', 0.45),
    sandDot: mix(mix(b.paper, '#F0D79A', 0.45), b.ink, 0.22),
    marsh: mix(b.paper, b.water, 0.3),
    reed: mix(b.tree, b.ink, 0.35),
  };
}

export function applyTheme(base) {
  Object.assign(PAL, derive(base));
  // fondo del escenario fuera del mapa, a juego con el tema
  document.documentElement.style.setProperty('--stage', mix(PAL.paper, PAL.ink, 0.12));
}
