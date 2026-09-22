import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Line, Text as SvgText, Polygon, Path, G } from 'react-native-svg';

// ─── Constantes del layout de tarjetas ───────────────────────────────────────
const CARD_WIDTH = 180;
const CARD_HEADER_HEIGHT = 58;

// Tamaño de los marcadores UML
const DIAMOND_LEN   = 22; // largo total del rombo (UML estándar)
const DIAMOND_WIDTH =  9; // semi-ancho del rombo
const ARROW_LEN     = 14; // largo del arrowhead
const ARROW_WIDTH   =  7; // semi-ancho del arrowhead

/**
 * Capa SVG que traza relaciones UML entre clases con terminadores y etiquetas
 * específicas según el tipo (asociación, agregación, composición, herencia).
 * No intercepta eventos táctiles (pointerEvents="none").
 *
 * Props:
 *   classes   — array de { id, x, y, attrs }
 *   relations — array de { id, fromId, toId, relationType, mult, label, intermediateTableName }
 *   width     — ancho del canvas
 *   height    — alto del canvas
 */
export default function RelationsLayer({ classes, relations, width, height }) {
  // Guards de nulos en las props
  if (!relations || relations.length === 0) return null;
  if (!classes || classes.length === 0) return null;

  // Mapa rápido id -> clase
  const byId = useMemo(() => {
    const map = {};
    if (Array.isArray(classes)) {
      classes.forEach(cls => {
        if (cls && cls.id != null) map[String(cls.id)] = cls;
      });
    }
    return map;
  }, [classes]);

  return (
    <Svg
      width={width}
      height={height}
      style={StyleSheet.absoluteFillObject}
      pointerEvents="none"
    >
      {relations.map((rel, idx) => {
        // Guard: la relación debe tener fromId y toId válidos
        if (!rel || !rel.fromId || !rel.toId) return null;

        const from = byId[String(rel.fromId)];
        const to   = byId[String(rel.toId)];
        if (!from || !to) return null;

        // ── Alturas y centros de cada tarjeta ────────────────────────────
        const fromHeight = estimateCardHeight(from);
        const toHeight   = estimateCardHeight(to);

        const fromCx = (from.x || 0) + CARD_WIDTH / 2;
        const fromCy = (from.y || 0) + fromHeight / 2;
        const toCx   = (to.x || 0) + CARD_WIDTH / 2;
        const toCy   = (to.y || 0) + toHeight / 2;

        // ── Intersección de la línea con el borde exacto de cada tarjeta ─
        const p1 = clampToCardEdge(fromCx, fromCy, toCx, toCy,
                                   from.x || 0, from.y || 0, CARD_WIDTH, fromHeight);
        const p2 = clampToCardEdge(toCx, toCy, fromCx, fromCy,
                                   to.x || 0, to.y || 0, CARD_WIDTH, toHeight);

        const x1 = p1.x;
        const y1 = p1.y;
        const x2 = p2.x;
        const y2 = p2.y;

        // ── Vector unitario y perpendicular ───────────────────────────────
        const dx     = x2 - x1;
        const dy     = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / length;
        const uy = dy / length;
        const px = -uy; // perpendicular
        const py =  ux;

        // ── Tipo de relación normalizado ──────────────────────────────────
        const relType = ((rel.relationType || 'association')).trim().toLowerCase();

        // ── Etiquetas en extremos ─────────────────────────────────────────
        const mult   = (rel.mult || '').trim();
        let sourceLabel = '';
        let targetLabel = '';

        if (relType === 'inheritance') {
          targetLabel = 'extends';
        } else if (relType === 'composition' || relType === 'aggregation') {
          sourceLabel = '1';
          targetLabel = mult || '1..*';
        } else {
          // association / N:M
          if (rel.sourceMultiplicity || rel.targetMultiplicity) {
            sourceLabel = rel.sourceMultiplicity || '';
            targetLabel = rel.targetMultiplicity || '';
          } else {
            const parts = mult ? mult.split('..') : [];
            sourceLabel = parts.length > 0 ? parts[0] : '';
            targetLabel = parts.length > 1 ? parts[1] : (parts[0] || (rel.label || ''));
          }
        }

        // ── Identificar clase intermedia si existe ────────────────────────
        const interClass = (rel.intermediateClassId && byId[String(rel.intermediateClassId)]) ||
          (rel.intermediateClassName && classes.find(c => c.name?.toLowerCase() === rel.intermediateClassName.toLowerCase())) ||
          (rel.intermediateTableName && classes.find(c => c.name?.toLowerCase() === rel.intermediateTableName.toLowerCase()));

        // ── Color según tipo ──────────────────────────────────────────────
        let strokeColor = '#38bdf8'; // Sky blue (asociación)
        if (relType === 'composition') strokeColor = '#ec4899'; // Rose
        if (relType === 'aggregation') strokeColor = '#a855f7'; // Purple
        if (relType === 'inheritance') strokeColor = '#22c55e'; // Green

        // ── Marcadores UML y ajuste de puntos inicio/fin de línea ─────────
        let marker    = null;
        let lineStart = { x: x1, y: y1 };
        let lineEnd   = { x: x2, y: y2 };

        if (relType === 'inheritance') {
          // Flecha triangular vacía (generalización UML) apuntando hacia 'to'
          const baseCenter = { x: x2 - ux * ARROW_LEN, y: y2 - uy * ARROW_LEN };
          const tip  = `${x2},${y2}`;
          const arm1 = `${baseCenter.x + px * ARROW_WIDTH},${baseCenter.y + py * ARROW_WIDTH}`;
          const arm2 = `${baseCenter.x - px * ARROW_WIDTH},${baseCenter.y - py * ARROW_WIDTH}`;
          marker  = (
            <Polygon
              points={`${tip} ${arm1} ${arm2}`}
              fill="#0f172a"
              stroke={strokeColor}
              strokeWidth={1.8}
              strokeLinejoin="round"
            />
          );
          lineEnd = baseCenter;

        } else if (relType === 'composition') {
          // Rombo RELLENO (sólido) pegado al borde del nodo contenedor 'from'
          const vTip  = { x: x1, y: y1 };
          const vOpp  = { x: x1 + ux * DIAMOND_LEN, y: y1 + uy * DIAMOND_LEN };
          const midX  = x1 + ux * (DIAMOND_LEN / 2);
          const midY  = y1 + uy * (DIAMOND_LEN / 2);
          const side1 = { x: midX + px * DIAMOND_WIDTH, y: midY + py * DIAMOND_WIDTH };
          const side2 = { x: midX - px * DIAMOND_WIDTH, y: midY - py * DIAMOND_WIDTH };
          marker = (
            <Polygon
              points={`${vTip.x},${vTip.y} ${side1.x},${side1.y} ${vOpp.x},${vOpp.y} ${side2.x},${side2.y}`}
              fill={strokeColor}
              stroke={strokeColor}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          );
          lineStart = vOpp;

        } else if (relType === 'aggregation') {
          // Rombo VACÍO (hueco) pegado al borde del nodo contenedor 'from'
          const vTip  = { x: x1, y: y1 };
          const vOpp  = { x: x1 + ux * DIAMOND_LEN, y: y1 + uy * DIAMOND_LEN };
          const midX  = x1 + ux * (DIAMOND_LEN / 2);
          const midY  = y1 + uy * (DIAMOND_LEN / 2);
          const side1 = { x: midX + px * DIAMOND_WIDTH, y: midY + py * DIAMOND_WIDTH };
          const side2 = { x: midX - px * DIAMOND_WIDTH, y: midY - py * DIAMOND_WIDTH };
          marker = (
            <Polygon
              points={`${vTip.x},${vTip.y} ${side1.x},${side1.y} ${vOpp.x},${vOpp.y} ${side2.x},${side2.y}`}
              fill="transparent"
              stroke={strokeColor}
              strokeWidth={1.8}
              strokeLinejoin="round"
            />
          );
          lineStart = vOpp;

        } else {
          // Asociación: flecha ABIERTA (dos brazos en "V") apuntando hacia 'to'
          const arrowBase = { x: x2 - ux * ARROW_LEN, y: y2 - uy * ARROW_LEN };
          const arm1 = `${arrowBase.x + px * ARROW_WIDTH},${arrowBase.y + py * ARROW_WIDTH}`;
          const arm2 = `${arrowBase.x - px * ARROW_WIDTH},${arrowBase.y - py * ARROW_WIDTH}`;
          marker = (
            <Path
              d={`M ${arm1} L ${x2},${y2} L ${arm2}`}
              fill="none"
              stroke={strokeColor}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }

        // ── Punto medio de la relación principal ─────────────────────────
        const midRelX = (lineStart.x + lineEnd.x) / 2;
        const midRelY = (lineStart.y + lineEnd.y) / 2;

        // ── Intersección con la clase intermedia si existe ───────────────
        let interConnector = null;
        if (interClass) {
          const interH = estimateCardHeight(interClass);
          const interCx = (interClass.x || 0) + CARD_WIDTH / 2;
          const interCy = (interClass.y || 0) + interH / 2;
          const interEdge = clampToCardEdge(interCx, interCy, midRelX, midRelY,
                                            interClass.x || 0, interClass.y || 0, CARD_WIDTH, interH);
          interConnector = {
            x1: midRelX,
            y1: midRelY,
            x2: interEdge.x,
            y2: interEdge.y,
          };
        }

        // ── Posición de etiquetas en los extremos de la línea ─────────────
        const LABEL_OFFSET = 28;
        const PERP_OFFSET  =  9;
        const srcLX = x1 + ux * LABEL_OFFSET + px * PERP_OFFSET;
        const srcLY = y1 + uy * LABEL_OFFSET + py * PERP_OFFSET;
        const dstLX = x2 - ux * LABEL_OFFSET + px * PERP_OFFSET;
        const dstLY = y2 - uy * LABEL_OFFSET + py * PERP_OFFSET;

        return (
          <G key={rel.id != null ? String(rel.id) : `rel-${idx}`}>

            {/* ── Línea discontinua punteada hacia la clase intermedia ── */}
            {interConnector && (
              <Line
                x1={interConnector.x1}
                y1={interConnector.y1}
                x2={interConnector.x2}
                y2={interConnector.y2}
                stroke={strokeColor}
                strokeWidth={1.5}
                strokeDasharray="6,4"
              />
            )}

            {/* ── Línea principal continua de conexión ── */}
            <Line
              x1={lineStart.x}
              y1={lineStart.y}
              x2={lineEnd.x}
              y2={lineEnd.y}
              stroke={strokeColor}
              strokeWidth={1.5}
            />

            {/* ── Terminador UML ── */}
            {marker}

            {/* ── Etiqueta extremo ORIGEN (multiplicidad source, ej. "0..*") ── */}
            {sourceLabel !== '' && (
              <SvgText
                x={srcLX}
                y={srcLY}
                fontSize={9}
                fontWeight="bold"
                fill={strokeColor}
                textAnchor="middle"
                alignmentBaseline="middle"
                fontFamily="monospace"
              >
                {sourceLabel}
              </SvgText>
            )}

            {/* ── Etiqueta extremo DESTINO (multiplicidad target, ej. "1..*") ── */}
            {targetLabel !== '' && (
              <SvgText
                x={dstLX}
                y={dstLY}
                fontSize={9}
                fontWeight="bold"
                fill={strokeColor}
                textAnchor="middle"
                alignmentBaseline="middle"
                fontFamily="monospace"
              >
                {targetLabel}
              </SvgText>
            )}

          </G>
        );
      })}
    </Svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Estimación de altura de la tarjeta para anclar al centro vertical.
 */
function estimateCardHeight(cls) {
  const attrCount = (cls && Array.isArray(cls.attrs)) ? cls.attrs.length : 0;
  return CARD_HEADER_HEIGHT + 1 + 16 + attrCount * 20 + 26;
}

/**
 * Calcula el punto donde el segmento (cx,cy)->(targetCx,targetCy) intersecta
 * el borde del rectángulo de la tarjeta ubicada en (rx, ry) con dimensiones (rw, rh).
 * Si no hay intersección (misma posición), retorna el centro (cx, cy).
 *
 * @param {number} cx       - centro X del nodo de origen
 * @param {number} cy       - centro Y del nodo de origen
 * @param {number} targetCx - centro X del nodo destino
 * @param {number} targetCy - centro Y del nodo destino
 * @param {number} rx       - X top-left de la tarjeta
 * @param {number} ry       - Y top-left de la tarjeta
 * @param {number} rw       - ancho de la tarjeta
 * @param {number} rh       - alto de la tarjeta
 * @returns {{ x: number, y: number }}
 */
function clampToCardEdge(cx, cy, targetCx, targetCy, rx, ry, rw, rh) {
  const dx = targetCx - cx;
  const dy = targetCy - cy;

  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  let tMin = Infinity;

  // Borde derecho / izquierdo
  if (dx > 0) {
    const t = (rx + rw - cx) / dx;
    if (t > 0) tMin = Math.min(tMin, t);
  } else if (dx < 0) {
    const t = (rx - cx) / dx;
    if (t > 0) tMin = Math.min(tMin, t);
  }

  // Borde inferior / superior
  if (dy > 0) {
    const t = (ry + rh - cy) / dy;
    if (t > 0) tMin = Math.min(tMin, t);
  } else if (dy < 0) {
    const t = (ry - cy) / dy;
    if (t > 0) tMin = Math.min(tMin, t);
  }

  if (!isFinite(tMin) || tMin <= 0) return { x: cx, y: cy };

  return {
    x: cx + tMin * dx,
    y: cy + tMin * dy,
  };
}
