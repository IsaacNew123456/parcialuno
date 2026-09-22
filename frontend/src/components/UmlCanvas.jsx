import { useRef, useCallback, useState } from 'react';
import useUmlStore from '../store/useUmlStore.js';
import wsClient from '../services/wsClient.js';
import UmlClassCard from './UmlClassCard.jsx';
import { createRoom, joinRoom } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';

export default function UmlCanvas() {
  const { classes, relations, currentRoom, setActiveRoom } = useUmlStore();
  const canvasRef = useRef(null);
  const addToast = useToast();

  const [inputCode, setInputCode] = useState('');
  const [loadingRoom, setLoadingRoom] = useState(false);

  const handleCreateRoom = async () => {
    setLoadingRoom(true);
    try {
      const newRoom = await createRoom({
        name: `Sala ${Date.now().toString(36).toUpperCase()}`,
      });
      setActiveRoom(newRoom, true);
      addToast(`¡Sala creada con código ${newRoom.code}!`, 'success');
      navigator.clipboard?.writeText(newRoom.code).catch(() => {});
    } catch (err) {
      addToast(`Error al crear sala: ${err.message}`, 'error');
    } finally {
      setLoadingRoom(false);
    }
  };

  const handleJoinDefaultRoom = async () => {
    setLoadingRoom(true);
    try {
      const room = await joinRoom('1234');
      setActiveRoom(room, true);
      addToast('Conectado a la sala por defecto 1234 ✓', 'success');
    } catch (err) {
      addToast(`Error al unirse a sala 1234: ${err.message}`, 'error');
    } finally {
      setLoadingRoom(false);
    }
  };

  const handleJoinByCode = async (e) => {
    e?.preventDefault();
    const code = inputCode.trim().toUpperCase();
    if (!code) {
      addToast('Ingresa un código de sala para unirte', 'warning');
      return;
    }
    setLoadingRoom(true);
    try {
      const room = await joinRoom(code);
      setActiveRoom(room, true);
      setInputCode('');
      addToast(`Conectado a sala ${room.code} ("${room.name}") ✓`, 'success');
    } catch (err) {
      addToast(`No se pudo conectar a la sala ${code}: ${err.message}`, 'error');
    } finally {
      setLoadingRoom(false);
    }
  };

  const handleCopyCode = () => {
    if (currentRoom?.code) {
      navigator.clipboard?.writeText(currentRoom.code).catch(() => {});
      addToast(`Código ${currentRoom.code} copiado al portapapeles ✓`, 'info');
    }
  };

  const dragState = useRef(null);
  const { updatePosition } = useUmlStore.getState();

  const onCardMouseDown = useCallback((e, cardId) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();

    const cls = useUmlStore.getState().classes.find((c) => c.id === cardId);
    if (!cls) return;

    dragState.current = {
      cardId,
      offsetX: e.clientX - canvasRect.left - cls.x,
      offsetY: e.clientY - canvasRect.top - cls.y,
    };

    function onMouseMove(ev) {
      if (!dragState.current) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, ev.clientX - rect.left - dragState.current.offsetX);
      const y = Math.max(0, ev.clientY - rect.top - dragState.current.offsetY);
      // Actualización reactiva local fluida sin inundar el broker en cada píxel
      updatePosition(dragState.current.cardId, x, y, false);
    }

    function onMouseUp() {
      if (dragState.current) {
        const id = dragState.current.cardId;
        const currentCls = useUmlStore.getState().classes.find((c) => c.id === id);
        if (currentCls) {
          // Mutación atómica persistente y broadcast a los demás clientes
          wsClient.sendMutation('CLASS_MOVED', {
            id: currentCls.id,
            x: currentCls.x,
            y: currentCls.y,
          });
          // Liberación automática del bloqueo al soltar el elemento
          wsClient.releaseLock(id, 'CLASS');
        }
      }
      dragState.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [updatePosition]);

  return (
    <main
      className="canvas-area"
      ref={canvasRef}
      role="region"
      aria-label="Lienzo UML"
    >
      {/* ── Barra superior colaborativa del lienzo ── */}
      <div className="canvas-collab-bar" role="toolbar" aria-label="Controles de sala colaborativa">
        <div
          className="canvas-room-status"
          title="Hacer clic para copiar código de sala"
          onClick={handleCopyCode}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleCopyCode()}
        >
          <span className="room-indicator-dot" aria-hidden="true" />
          <span className="room-label">SALA ACTIVA:</span>
          <span className="room-code-tag">{currentRoom?.code || '1234'}</span>
          <span className="room-name-text">{currentRoom?.name ? `(${currentRoom.name})` : ''}</span>
          <button type="button" className="btn-copy-code" title="Copiar código al portapapeles" aria-label="Copiar código">
            <CopyIcon />
          </button>
        </div>

        <div className="canvas-room-actions">
          <button
            type="button"
            className="btn btn-sm btn-create-room"
            onClick={handleCreateRoom}
            disabled={loadingRoom}
            title="Crear una nueva sala colaborativa con código único"
            id="btn-create-room"
          >
            <PlusIcon /> Crear Sala
          </button>

          <button
            type="button"
            className="btn btn-sm btn-quick-room"
            onClick={handleJoinDefaultRoom}
            disabled={loadingRoom}
            title="Conexión rápida a la sala por defecto 1234"
            id="btn-quick-room-1234"
          >
            Sala 1234
          </button>

          <form className="canvas-room-join-form" onSubmit={handleJoinByCode}>
            <input
              type="text"
              className="input-room-code"
              placeholder="Código (ej. 1234)"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              maxLength={12}
              aria-label="Código de sala para unirse"
            />
            <button
              type="submit"
              className="btn btn-sm btn-join-room"
              disabled={loadingRoom || !inputCode.trim()}
              title="Unirse a la sala indicada por código"
            >
              Unirse
            </button>
          </form>
        </div>
      </div>

      {classes.length === 0 && (
        <div className="canvas-empty" aria-live="polite">
          <div className="canvas-empty-icon" aria-hidden="true">
            <CanvasIcon />
          </div>
          <div className="canvas-empty-text">
            <h3>Lienzo de Modelado Vacío</h3>
            <p>Agrega una clase desde el panel lateral para comenzar.</p>
            <p style={{ fontSize: '0.72rem', marginTop: '0.5rem', color: 'var(--color-text-3)' }}>
              O di por micrófono: "crear clase [Nombre]"
            </p>
          </div>
        </div>
      )}

      {/* SVG para relaciones entre clases */}
      <svg className="canvas-svg" aria-hidden="true">
        <defs>
          {/* Asociación: flecha abierta en destino */}
          <marker
            id="marker-association"
            markerWidth="12"
            markerHeight="12"
            refX="10"
            refY="6"
            orient="auto"
          >
            <path
              d="M 2,2 L 10,6 L 2,10"
              fill="none"
              stroke="var(--color-accent, #5b8dee)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </marker>

          {/* Agregación: rombo hueco ◇ en el extremo origen */}
          <marker
            id="marker-aggregation"
            markerWidth="22"
            markerHeight="14"
            refX="1"
            refY="7"
            orient="auto"
          >
            <polygon
              points="1,7 11,2 21,7 11,12"
              fill="var(--color-canvas, #0a0c12)"
              stroke="var(--color-accent, #5b8dee)"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </marker>

          {/* Composición: rombo relleno ◆ en el extremo origen */}
          <marker
            id="marker-composition"
            markerWidth="22"
            markerHeight="14"
            refX="1"
            refY="7"
            orient="auto"
          >
            <polygon
              points="1,7 11,2 21,7 11,12"
              fill="var(--color-accent, #5b8dee)"
              stroke="var(--color-accent, #5b8dee)"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </marker>

          {/* Generalización / Herencia: flecha triangular vacía ◁ en destino */}
          <marker
            id="marker-inheritance"
            markerWidth="16"
            markerHeight="14"
            refX="14"
            refY="7"
            orient="auto"
          >
            <polygon
              points="2,2 14,7 2,12"
              fill="var(--color-canvas, #0a0c12)"
              stroke="var(--color-accent, #5b8dee)"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </marker>
        </defs>

        {relations.map((rel) => {
          const from = classes.find((c) => c.id === rel.fromId || c.id === rel.sourceId);
          const to   = classes.find((c) => c.id === rel.toId || c.id === rel.targetId);
          if (!from || !to) return null;

          return (
            <RelationLine key={rel.id} from={from} to={to} relation={rel} />
          );
        })}
      </svg>

      {/* Tarjetas UML */}
      <div className="canvas-cards">
        {classes.map((cls) => (
          <UmlClassCard
            key={cls.id}
            cls={cls}
            onMouseDown={(e) => onCardMouseDown(e, cls.id)}
          />
        ))}
      </div>

      {classes.length > 0 && (
        <div className="status-bar" aria-label="Estado del lienzo">
          <span>{classes.length} clase{classes.length !== 1 ? 's' : ''}</span>
          <span className="sep">·</span>
          <span>{relations.length} relación{relations.length !== 1 ? 'es' : ''}</span>
          <span className="sep">·</span>
          <span style={{ color: 'var(--color-text-3)' }}>Arrastra para posicionar</span>
        </div>
      )}
    </main>
  );
}

const CARD_W = 180;

function getCardHeight(cls) {
  const attrCount = (cls?.attrs && cls.attrs.length) || 0;
  return Math.max(85, 45 + attrCount * 22 + 24);
}

function getCardIntersection(card, targetPoint, cardW, cardH) {
  const cx = card.x + cardW / 2;
  const cy = card.y + cardH / 2;
  const dx = targetPoint.x - cx;
  const dy = targetPoint.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const hw = cardW / 2 + 1;
  const hh = cardH / 2 + 1;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx * hh > absDy * hw) {
    const edgeX = dx > 0 ? cx + hw : cx - hw;
    const edgeY = cy + (dy / absDx) * hw;
    return { x: edgeX, y: edgeY };
  } else {
    const edgeY = dy > 0 ? cy + hh : cy - hh;
    const edgeX = cx + (dx / absDy) * hh;
    return { x: edgeX, y: edgeY };
  }
}

function RelationLine({ from, to, relation }) {
  const fromH = getCardHeight(from);
  const toH = getCardHeight(to);

  const fromCenter = { x: from.x + CARD_W / 2, y: from.y + fromH / 2 };
  const toCenter = { x: to.x + CARD_W / 2, y: to.y + toH / 2 };

  const start = getCardIntersection(from, toCenter, CARD_W, fromH);
  const end = getCardIntersection(to, fromCenter, CARD_W, toH);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.hypot(dx, dy);

  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;

  // Curvatura suave perpendicular para un trazado estético y legible
  const curvature = Math.min(dist * 0.12, 28);
  let nx = -dy / (dist || 1);
  let ny = dx / (dist || 1);
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const cx = mx + nx * curvature;
  const cy = my + ny * curvature;

  const d = `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`;

  const type = relation.relationType || 'association';
  const isInheritance = type === 'inheritance';
  const isComposition = type === 'composition';
  const isAggregation = type === 'aggregation';
  const isContainerRel = isComposition || isAggregation;
  const isManyToMany = relation.mult === '*..*' || !!relation.intermediateTableName;

  // Tangente en el origen (t = 0) para orientar el rombo exactamente a lo largo de la línea
  const vx = cx - start.x;
  const vy = cy - start.y;
  const angleDeg = (Math.atan2(vy, vx) * 180) / Math.PI;

  const markerEnd = isInheritance ? 'url(#marker-inheritance)' : 'url(#marker-association)';
  const strokeDash = isManyToMany ? '5 3' : undefined;

  // En Composición y Agregación, la multiplicidad es estrictamente 1 a muchos (1 en origen, * en destino)
  const srcMult = isInheritance ? '' : (isContainerRel ? '1' : (relation.sourceMultiplicity || (relation.mult && relation.mult.includes('..') ? relation.mult.split('..')[0] : '1')));
  const tgtMult = isInheritance ? '' : (isContainerRel ? '*' : (relation.targetMultiplicity || (relation.mult && relation.mult.includes('..') ? relation.mult.split('..')[1] : (relation.mult || '1..*'))));

  // Puntos calculados a lo largo de la curva cuadrática
  const tSrc = isContainerRel ? 0.30 : 0.20;
  const sx = (1 - tSrc) * (1 - tSrc) * start.x + 2 * (1 - tSrc) * tSrc * cx + tSrc * tSrc * end.x;
  const sy = (1 - tSrc) * (1 - tSrc) * start.y + 2 * (1 - tSrc) * tSrc * cy + tSrc * tSrc * end.y;

  const tTgt = 0.80;
  const ex = (1 - tTgt) * (1 - tTgt) * start.x + 2 * (1 - tTgt) * tTgt * cx + tTgt * tTgt * end.x;
  const ey = (1 - tTgt) * (1 - tTgt) * start.y + 2 * (1 - tTgt) * tTgt * cy + tTgt * tTgt * end.y;

  const mxBez = 0.25 * start.x + 0.5 * cx + 0.25 * end.x;
  const myBez = 0.25 * start.y + 0.5 * cy + 0.25 * end.y;

  return (
    <g className={`relation-group relation-${type}`}>
      <path
        d={d}
        className="svg-arrow"
        stroke="var(--color-accent, #5b8dee)"
        strokeWidth="1.8"
        strokeDasharray={strokeDash}
        opacity="0.9"
        markerEnd={markerEnd}
      />

      {/* Rombo característico de Composición (◆ relleno) o Agregación (◇ hueco) en el contenedor */}
      {isContainerRel && (
        <g transform={`translate(${start.x}, ${start.y}) rotate(${angleDeg})`}>
          <polygon
            points="0,0 10,-6 20,0 10,6"
            fill={isComposition ? 'var(--color-accent, #5b8dee)' : 'var(--color-canvas, #0a0c12)'}
            stroke="var(--color-accent, #5b8dee)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </g>
      )}

      {isInheritance ? (
        <text
          x={mxBez}
          y={myBez - 8}
          className="svg-arrow-label"
          textAnchor="middle"
          fill="var(--color-accent, #5b8dee)"
          style={{ fontStyle: 'italic', fontSize: '10px' }}
        >
          &laquo;hereda&raquo;
        </text>
      ) : (
        <>
          {/* Multiplicidad en Origen */}
          <text
            x={sx}
            y={sy - 8}
            className="svg-arrow-label"
            textAnchor="middle"
            style={{ fontWeight: 700, fontSize: '11px', fill: 'var(--color-text, #e8eaf6)' }}
          >
            {srcMult}
          </text>

          {/* Multiplicidad en Destino */}
          <text
            x={ex}
            y={ey - 8}
            className="svg-arrow-label"
            textAnchor="middle"
            style={{ fontWeight: 700, fontSize: '11px', fill: 'var(--color-text, #e8eaf6)' }}
          >
            {tgtMult}
          </text>

          {/* Etiqueta central de Tabla Intermedia en N:M */}
          {isManyToMany && relation.intermediateTableName && (
            <g transform={`translate(${mxBez}, ${myBez - 12})`}>
              <rect
                x="-46"
                y="-10"
                width="92"
                height="18"
                rx="4"
                fill="var(--color-surface, #181b24)"
                stroke="var(--color-accent, #5b8dee)"
                strokeWidth="0.8"
                opacity="0.95"
              />
              <text
                x="0"
                y="3"
                className="svg-arrow-label"
                textAnchor="middle"
                fill="var(--color-accent, #5b8dee)"
                style={{ fontSize: '9px', fontWeight: 600 }}
              >
                {relation.intermediateTableName}
              </text>
            </g>
          )}
        </>
      )}
    </g>
  );
}

function CanvasIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}
