/**
 * Tipos y contratos formales para el modelado UML y generación relacional
 * CASE UML Studio
 */

export type RelationType = 'association' | 'aggregation' | 'composition' | 'inheritance';

export type Multiplicity = '1..1' | '1..*' | '*..1' | '0..1' | '0..*' | '*..*' | string;

export interface IntermediateTableInfo {
  tableName: string;
  sourceForeignKey: string;
  targetForeignKey: string;
}

export interface Relation {
  id: string;
  // Campos estándar TypeScript / UML formal
  sourceId: string;
  targetId: string;
  relationType: RelationType;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
  intermediateTableInfo?: IntermediateTableInfo;

  // Campos de compatibilidad con backend existente
  fromId: string;
  toId: string;
  fromName?: string;
  toName?: string;
  mult: string;
  intermediateTableName?: string;
}

export interface AttrModel {
  name: string;
  type: string;
  isPrimary?: boolean;
}

export interface ClassModel {
  id: string;
  name: string;
  attrs: AttrModel[];
  x: number;
  y: number;
}

export interface DiagramModel {
  id?: string | number | null;
  name: string;
  classes: ClassModel[];
  relations: Relation[];
}
