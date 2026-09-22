/**
 * Utilidades para nomenclatura y detección de relaciones UML.
 */

/**
 * Genera una abreviatura limpia y reconocible para una clase.
 * Ejemplo:
 *   - "DOCENTE"   -> "Doc"
 *   - "TRIBUNAL"  -> "Trib"
 *   - "Estudiante"-> "Est"
 *   - "Rol"       -> "Rol"
 *   - "Item"      -> "Item"
 */
export function abbreviateClassName(name = '') {
  if (!name || typeof name !== 'string') return 'Item';
  const clean = name.replace(/[^A-Za-z0-9]/g, '');
  if (!clean) return 'Item';

  // Si ya es corto (<= 4 letras), capitalizar primera letra y resto minúsculas
  if (clean.length <= 4) {
    return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
  }

  // Tomar primeras 3 letras (o 4 si empieza por consonantes complejas)
  const prefix = clean.slice(0, clean.length >= 7 ? 4 : 3);
  return prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase();
}

/**
 * Genera el nombre estricto de la clase intermedia:
 * "Detalle_" + abreviatura(A) + abreviatura(B)
 * Ejemplo: DOCENTE y TRIBUNAL -> "Detalle_DocTrib"
 */
export function generateIntermediateClassName(nameA = '', nameB = '') {
  const abbrA = abbreviateClassName(nameA);
  const abbrB = abbreviateClassName(nameB);
  return `Detalle_${abbrA}${abbrB}`;
}

/**
 * Determina si una multiplicidad individual representa "muchos" (*, 0..*, 1..*, M, N).
 */
export function isManyMultiplicity(mult = '') {
  if (!mult) return false;
  const s = String(mult).trim().toLowerCase();
  return s === '*' || s.includes('..*') || s.includes(':*') || s === 'm' || s === 'n' || s.endsWith('*');
}

/**
 * Determina si una relación es de Muchos a Muchos (N:M).
 * Considera multiplicidades en ambos extremos (ej. 0..* a 1..*, *..*, etc.).
 */
export function isManyToMany(sourceMult = '', targetMult = '', rawMult = '') {
  const raw = String(rawMult || '').trim().toLowerCase();
  if (raw === '*..*' || raw.includes('n..m') || raw.includes('m..n') || raw.includes('* a *') || raw === 'n:m') {
    return true;
  }

  // Si se reciben multiplicidades en ambos extremos
  if (isManyMultiplicity(sourceMult) && isManyMultiplicity(targetMult)) {
    return true;
  }

  // Si rawMult tiene formato "0..*..1..*" o "0..*..*"
  if (raw.includes('..')) {
    const parts = raw.split('..');
    if (parts.length === 2) {
      // Formato tradicional "A..B"
      return isManyMultiplicity(parts[0]) && isManyMultiplicity(parts[1]);
    }
    if (parts.length >= 3) {
      // Formato "0..*..1..*" -> parte 1 y parte final
      const first = parts.slice(0, 2).join('..');
      const second = parts.slice(2).join('..');
      return isManyMultiplicity(first) && isManyMultiplicity(second);
    }
  }

  return false;
}
