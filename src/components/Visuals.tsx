import { FUNCTIONS, type Character, type Scores } from "../simulation/types";
import { FUNCTION_INFO } from "../simulation/personality";
import { hash } from "../simulation/random";

export function Avatar({
  character,
  small = false,
}: {
  character: Character;
  small?: boolean;
}) {
  const variation = hash(character.seed) % 3;
  return (
    <div
      className={`avatar ${small ? "avatar-small" : ""}`}
      aria-label={`${character.name}的原创角色头像`}
    >
      <svg viewBox="0 0 120 120" role="img">
        <title>{character.name}</title>
        <path
          d="M22 115c0-25 16-39 38-39s38 14 38 39"
          fill={variation === 1 ? "#c97f5d" : "#718b69"}
        />
        <path
          d="M37 67c-12-5-12-27-3-39C48 8 80 17 86 40c5 18-3 33-12 38"
          fill="#35483d"
        />
        <path d="M51 71h18v16c-7 7-13 7-18 0z" fill="#dfac85" />
        <ellipse cx="60" cy="53" rx="23" ry="28" fill="#efc29b" />
        <path
          d="M35 49c-2-22 13-30 27-29 17 0 28 15 24 31-11-1-21-10-25-18-4 11-15 15-26 16"
          fill="#35483d"
        />
        <path
          d="M46 51h5m18 0h5"
          stroke="#35483d"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M55 65q5 5 11 0"
          fill="none"
          stroke="#9b6554"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {variation === 2 && (
          <g fill="none" stroke="#35483d" strokeWidth="2">
            <rect x="40" y="46" width="17" height="13" rx="5" />
            <rect x="64" y="46" width="17" height="13" rx="5" />
            <path d="M57 50h7" />
          </g>
        )}
        <path d="M46 84l14 13 14-13" fill="#f8f2df" />
        <path d="M60 97v23" stroke="#f8f2df" strokeWidth="2" />
      </svg>
    </div>
  );
}

export function LifeIllustration() {
  return (
    <svg className="life-illustration" viewBox="0 0 470 235" aria-hidden="true">
      <defs>
        <pattern
          id="paper-dots"
          width="16"
          height="16"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r="1" fill="#e2dfcf" />
        </pattern>
      </defs>
      <rect width="470" height="235" fill="url(#paper-dots)" opacity=".5" />
      <ellipse cx="267" cy="213" rx="155" ry="10" fill="#e3e5d7" />
      <path
        d="M20 170C97 229 107 80 176 123s88 109 118 25 89-45 150-100"
        fill="none"
        stroke="#acbaa3"
        strokeWidth="2"
        strokeDasharray="5 7"
      />
      <circle cx="413" cy="41" r="26" fill="#e6bb75" />
      <path
        d="M413 8v-8m0 82v-8m33-33h9m-84 0h9m57-23 6-6m-60 60 6-6"
        stroke="#caac73"
        strokeWidth="2"
      />
      <path
        d="M142 207v-86h37V87h38V53h38v154"
        fill="#c9d3bd"
        stroke="#84977a"
        strokeWidth="1.5"
      />
      <path
        d="M125 207h161m-143-86h36m0-34h38m0-34h38"
        stroke="#84977a"
        strokeWidth="1.5"
      />
      <g transform="translate(251 69) rotate(13)">
        <rect
          width="76"
          height="94"
          rx="4"
          fill="#fbf9ed"
          stroke="#536c54"
          strokeWidth="1.7"
        />
        <path
          d="M13 19h49m-49 10h33m-33 37h48m-48 10h38"
          stroke="#a8b69a"
          strokeWidth="2"
        />
        <path
          d="M14 48l11-9 14 12 18-15"
          fill="none"
          stroke="#c48461"
          strokeWidth="2.5"
        />
        <circle cx="57" cy="36" r="3" fill="#c48461" />
      </g>
      <g transform="translate(60 58) rotate(-13)">
        <path
          d="M0 9q24-9 43 4 20-12 44-4v58q-23-6-44 5-21-11-43-5z"
          fill="#efdfb6"
          stroke="#8f8864"
          strokeWidth="1.5"
        />
        <path
          d="M43 13v59M9 23l23 3m-23 8 23 3m21-11 23-3m-23 14 23-3"
          stroke="#afa57e"
          strokeWidth="1.5"
        />
      </g>
      <path
        d="M362 211v-51m0 33c-35 0-39-35-34-47 27 7 35 28 34 47m0-13c31-2 39-30 33-45-23 7-34 27-33 45"
        fill="#96ab80"
        stroke="#637b59"
        strokeWidth="1.5"
      />
      <path d="M343 207h39l-6 24h-27z" fill="#c88b6a" />
      <path d="M212 52l3-27 19 2-3 26" fill="#6e865e" />
      <circle cx="226" cy="13" r="11" fill="#edc19d" />
      <path d="M215 10c2-14 23-11 23 2-8 0-11-3-15-6" fill="#35483d" />
      <path
        d="M216 31l-17 13m34-14 14 8m-30 12-9 23m21-21 5 15"
        stroke="#35483d"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M196 43l-5-7m56 2 7-5"
        stroke="#d5a681"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M345 45l3 8 8 3-8 3-3 8-3-8-8-3 8-3zM37 122l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"
        fill="#bd8b57"
      />
    </svg>
  );
}

export function Radar({ scores }: { scores: Scores }) {
  const center = 100,
    radius = 67;
  const point = (index: number, scale: number) => {
    const angle = -Math.PI / 2 + (index * Math.PI) / 4;
    return `${center + Math.cos(angle) * radius * scale},${center + Math.sin(angle) * radius * scale}`;
  };
  return (
    <svg
      className="radar"
      viewBox="0 0 200 200"
      role="img"
      aria-label={`荣格八维：${FUNCTIONS.map((key) => `${key} ${scores[key]}`).join("，")}`}
    >
      {[0.25, 0.5, 0.75, 1].map((level) => (
        <polygon
          key={level}
          points={FUNCTIONS.map((_, i) => point(i, level)).join(" ")}
          fill="none"
          stroke="#dedfd3"
          strokeWidth=".7"
        />
      ))}
      {FUNCTIONS.map((_, i) => (
        <line
          key={i}
          x1={center}
          y1={center}
          x2={point(i, 1).split(",")[0]}
          y2={point(i, 1).split(",")[1]}
          stroke="#dedfd3"
          strokeWidth=".7"
        />
      ))}
      <polygon
        points={FUNCTIONS.map((key, i) => point(i, scores[key] / 100)).join(
          " ",
        )}
        fill="#79966d"
        fillOpacity=".23"
        stroke="#67865a"
        strokeWidth="1.8"
      />
      {FUNCTIONS.map((key, i) => {
        const [x, y] = point(i, 1.26).split(",").map(Number);
        const [cx, cy] = point(i, scores[key] / 100)
          .split(",")
          .map(Number);
        return (
          <g key={key}>
            <circle cx={cx} cy={cy} r="2.4" fill="#67865a" />
            <text
              x={x}
              y={y + 4}
              textAnchor="middle"
              fill="#5d6b5c"
              fontSize="10.5"
              fontFamily="monospace"
            >
              {key}
            </text>
            <title>
              {FUNCTION_INFO[key].name} {scores[key]}
            </title>
          </g>
        );
      })}
    </svg>
  );
}

export function Sparkline({
  values,
  color = "#708966",
  fill = false,
}: {
  values: number[];
  color?: string;
  fill?: boolean;
}) {
  if (!values.length) return null;
  const min = Math.min(...values) - 5,
    max = Math.max(...values) + 5;
  const coords = values.map(
    (value, index) =>
      `${(index / Math.max(1, values.length - 1)) * 180},${40 - ((value - min) / (max - min)) * 35}`,
  );
  return (
    <svg viewBox="0 0 180 45" className="sparkline" aria-hidden="true">
      {fill && (
        <polygon
          points={`0,45 ${coords.join(" ")} 180,45`}
          fill={color}
          opacity=".09"
        />
      )}
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
