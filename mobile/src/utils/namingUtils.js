/**
 * Utilidades para nomenclatura y detección de relaciones UML (Mobile).
 */

export function abbreviateClassName(name = '') {
  if (!name || typeof name !== 'string') return 'Item';
  const clean = name.replace(/[^A-Za-z0-9]/g, '');
  if (!clean) return 'Item';

  if (clean.length <= 4) {
    return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
  }

  const prefix = clean.slice(0, clean.length >= 7 ? 4 : 3);
  return prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase();
}

export function generateIntermediateClassName(nameA = '', nameB = '') {
  const abbrA = abbreviateClassName(nameA);
  const abbrB = abbreviateClassName(nameB);
  return `Detalle_${abbrA}${abbrB}`;
}

export function isManyMultiplicity(mult = '') {
  if (!mult) return false;
  const s = String(mult).trim().toLowerCase();
  return s === '*' || s.includes('..*') || s.includes(':*') || s === 'm' || s === 'n' || s.endsWith('*');
}

export function isManyToMany(sourceMult = '', targetMult = '', rawMult = '') {
  const raw = String(rawMult || '').trim().toLowerCase();
  if (raw === '*..*' || raw.includes('n..m') || raw.includes('m..n') || raw.includes('* a *') || raw === 'n:m') {
    return true;
  }

  if (isManyMultiplicity(sourceMult) && isManyMultiplicity(targetMult)) {
    return true;
  }

  if (raw.includes('..')) {
    const parts = raw.split('..');
    if (parts.length === 2) {
      return isManyMultiplicity(parts[0]) && isManyMultiplicity(parts[1]);
    }
    if (parts.length >= 3) {
      const first = parts.slice(0, 2).join('..');
      const second = parts.slice(2).join('..');
      return isManyMultiplicity(first) && isManyMultiplicity(second);
    }
  }

  return false;
}
