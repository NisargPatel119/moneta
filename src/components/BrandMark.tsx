// Moneta's mark: the eight-pointed rosette struck on Roman coins, inside a coin.
// Pure geometry with inline styles (no Tailwind, no fonts), so the same component renders
// in the app and inside next/og's ImageResponse for the browser and home-screen icons.

type Props = {
  size: number;
  /** Coin color */
  ink: string;
  /** Rosette color */
  paper: string;
  /** Fill the whole square instead of a round coin (iOS rounds the corners itself) */
  square?: boolean;
};

const PETALS = [0, 45, 90, 135, 180, 225, 270, 315];

export function BrandMark({ size, ink, paper, square = false }: Props) {
  // Small icons get slightly fatter petals so they don't blur together
  const small = size <= 32;
  const rx = small ? 4.4 : 3.8;
  const ry = small ? 9.2 : 9.6;
  const cy = small ? 21.5 : 21;

  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        flexShrink: 0,
        borderRadius: square ? 0 : size,
        background: ink,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 64 64">
        {PETALS.map(deg => (
          <ellipse key={deg} cx="32" cy={cy} rx={rx} ry={ry} fill={paper} transform={`rotate(${deg} 32 32)`} />
        ))}
      </svg>
    </div>
  );
}
