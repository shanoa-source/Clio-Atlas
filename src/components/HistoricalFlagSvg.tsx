import React, { useEffect, useMemo, useState } from 'react';
import { sanitizeInlineFlagSvg } from '../shared/dataValidator';
import { AppLanguage, FlagVariantId } from '../types/history';

interface HistoricalFlagSvgProps {
  flagId?: FlagVariantId;
  flagSvg?: string;
  flagAsset?: string;
  label?: string;
  className?: string;
  language?: AppLanguage;
}

const FLAG_ARIA_LABELS: Record<FlagVariantId, Record<AppLanguage, string>> = {
  archaic_owl: {
    zh: '古风晚期雅典娜圣鸮与橄榄枝旗徽',
    en: 'Late Archaic Athena Owl and olive-branch emblem',
    de: 'Spätarchaisches Eulen-Emblem der Athene mit Olivenzweig',
  },
  delian_alliance: {
    zh: '提洛阿波罗圣星与三列桨海盟旗',
    en: 'Delian League Apollo sunburst and trireme ensign',
    de: 'Delischer Seebund: Apollon-Stern und Trieren-Banner',
  },
  imperial_athens: {
    zh: '古典盛期 ΑΘΕ 四德拉克马银币猫头鹰帝国徽旗',
    en: 'Classical Athenian ΑΘΕ Owl tetradrachm imperial standard',
    de: 'Klassisches Athener ΑΘΕ-Eulen-Tetradrachmen-Banner',
  },
  strategoi_wartime: {
    zh: '伯罗奔尼撒战时雅典十将军盾徽军旗',
    en: 'Peloponnesian Wartime Athenian Strategoi hoplite shield standard',
    de: 'Kriegsbanner der zehn Athener Strategen im Peloponnesischen Krieg',
  },
  ionian_siege: {
    zh: '萨摩斯民主舰队与雅典守城残旗',
    en: 'Samos democratic fleet and besieged Athens standard (404 BCE)',
    de: 'Banner der demokratischen Flotte vor Samos und des belagerten Athen (404 v. Chr.)',
  },
};

/**
 * Extensible historical flag & standard renderer:
 * 1. Sanitized inline `flagSvg` (custom SVG vexillum / emblem)
 * 2. External or data-URI `flagAsset` with resilient SVG fallback
 * 3. Five built-in Classical preset emblems (`FlagVariantId`)
 */
export const HistoricalFlagSvg: React.FC<HistoricalFlagSvgProps> = ({
  flagId,
  flagSvg,
  flagAsset,
  label,
  className = 'w-14 h-9',
  language = 'zh',
}) => {
  const [assetFailed, setAssetFailed] = useState(false);

  useEffect(() => {
    setAssetFailed(false);
  }, [flagAsset]);

  const sanitizedCustomSvg = useMemo(() => {
    if (!flagSvg || typeof flagSvg !== 'string') return null;
    return sanitizeInlineFlagSvg(flagSvg);
  }, [flagSvg]);

  const defaultAria =
    (flagId && (FLAG_ARIA_LABELS[flagId]?.[language] || FLAG_ARIA_LABELS[flagId]?.zh)) ||
    label ||
    (language === 'en'
      ? 'Historical polity standard'
      : language === 'de'
        ? 'Historisches Herrschaftsbanner'
        : '历史政权旗徽');

  if (sanitizedCustomSvg) {
    return (
      <span
        role="img"
        aria-label={defaultAria}
        data-flag-mode="svg"
        className={`inline-flex items-center justify-center overflow-hidden [&>svg]:w-full [&>svg]:h-full ${className}`}
        dangerouslySetInnerHTML={{ __html: sanitizedCustomSvg }}
      />
    );
  }

  if (flagAsset && !assetFailed) {
    return (
      <img
        src={flagAsset}
        alt={defaultAria}
        referrerPolicy="no-referrer"
        data-flag-mode="asset"
        onError={() => setAssetFailed(true)}
        className={`object-cover ${className}`}
      />
    );
  }

  switch (flagId) {
    case 'archaic_owl':
      return (
        <svg viewBox="0 0 90 60" className={className} role="img" aria-label={defaultAria}>
          <rect width="90" height="60" rx="4" fill="#1E3A8A" />
          <rect
            x="3"
            y="3"
            width="84"
            height="54"
            rx="2"
            fill="none"
            stroke="#93C5FD"
            strokeWidth="1.5"
          />
          <path
            d="M18 44 Q16 28 24 16"
            fill="none"
            stroke="#86EFAC"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <ellipse cx="16" cy="34" rx="4.5" ry="2.2" transform="rotate(-35 16 34)" fill="#86EFAC" />
          <ellipse cx="19" cy="24" rx="4.5" ry="2.2" transform="rotate(-25 19 24)" fill="#86EFAC" />
          <ellipse cx="46" cy="35" rx="11" ry="13" fill="#E2E8F0" />
          <circle cx="46" cy="21" r="9.5" fill="#F8FAFC" />
          <circle cx="42.2" cy="20.5" r="3.4" fill="#0F172A" stroke="#FBBF24" strokeWidth="1.2" />
          <circle cx="49.8" cy="20.5" r="3.4" fill="#0F172A" stroke="#FBBF24" strokeWidth="1.2" />
          <polygon points="46,22.5 44.2,26 47.8,26" fill="#F59E0B" />
          <path d="M39 32 Q46 39 53 32" fill="none" stroke="#64748B" strokeWidth="1.6" />
          <text x="64" y="42" fill="#F8FAFC" fontSize="10" fontWeight="700" fontFamily="serif">
            ΑΘΕ
          </text>
        </svg>
      );

    case 'delian_alliance':
      return (
        <svg viewBox="0 0 90 60" className={className} role="img" aria-label={defaultAria}>
          <rect width="90" height="60" rx="4" fill="#0369A1" />
          <path d="M0 46 Q22 41 45 46 T90 46 L90 60 L0 60 Z" fill="#0C4A6E" />
          <rect
            x="3"
            y="3"
            width="84"
            height="54"
            rx="2"
            fill="none"
            stroke="#7DD3FC"
            strokeWidth="1.5"
          />
          <g transform="translate(27, 25)">
            <circle cx="0" cy="0" r="6" fill="#FDE047" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <line
                key={deg}
                x1="0"
                y1="-8"
                x2="0"
                y2="-13"
                stroke="#FDE047"
                strokeWidth="1.8"
                transform={`rotate(${deg})`}
              />
            ))}
          </g>
          <path d="M46 35 L74 35 L79 31 L71 29 L49 29 Z" fill="#F8FAFC" />
          <line x1="60" y1="16" x2="60" y2="30" stroke="#FDE68A" strokeWidth="1.8" />
          <path d="M51 19 Q60 15 69 19 L67 27 Q60 25 53 27 Z" fill="#E0F2FE" />
        </svg>
      );

    case 'imperial_athens':
      return (
        <svg viewBox="0 0 90 60" className={className} role="img" aria-label={defaultAria}>
          <rect width="90" height="60" rx="4" fill="#312E81" />
          <rect
            x="3"
            y="3"
            width="84"
            height="54"
            rx="2"
            fill="none"
            stroke="#FBBF24"
            strokeWidth="1.8"
          />
          <circle cx="45" cy="30" r="21" fill="#1E1B4B" stroke="#FBBF24" strokeWidth="1.5" />
          <path d="M29 24 Q31 16 36 14" fill="none" stroke="#A7F3D0" strokeWidth="1.6" />
          <ellipse cx="30" cy="19" rx="3.8" ry="1.8" transform="rotate(-35 30 19)" fill="#A7F3D0" />
          <path d="M35 24 A4 4 0 1 1 35 18 A3 3 0 1 0 35 24 Z" fill="#FDE68A" />
          <ellipse cx="45" cy="34" rx="8.5" ry="10.5" fill="#FDE68A" />
          <circle cx="45" cy="22" r="7.5" fill="#FEF3C7" />
          <circle cx="42" cy="21.5" r="2.6" fill="#1E1B4B" stroke="#F59E0B" strokeWidth="1" />
          <circle cx="48" cy="21.5" r="2.6" fill="#1E1B4B" stroke="#F59E0B" strokeWidth="1" />
          <polygon points="45,23 43.5,26 46.5,26" fill="#D97706" />
          <text x="55" y="25" fill="#FDE68A" fontSize="6.5" fontWeight="700" fontFamily="serif">
            Α
          </text>
          <text x="55" y="33" fill="#FDE68A" fontSize="6.5" fontWeight="700" fontFamily="serif">
            Θ
          </text>
          <text x="55" y="41" fill="#FDE68A" fontSize="6.5" fontWeight="700" fontFamily="serif">
            Ε
          </text>
        </svg>
      );

    case 'strategoi_wartime':
      return (
        <svg viewBox="0 0 90 60" className={className} role="img" aria-label={defaultAria}>
          <rect width="90" height="60" rx="4" fill="#78350F" />
          <rect
            x="3"
            y="3"
            width="84"
            height="54"
            rx="2"
            fill="none"
            stroke="#FBBF24"
            strokeWidth="1.6"
          />
          <circle cx="45" cy="30" r="20" fill="#B45309" stroke="#FDE68A" strokeWidth="2.5" />
          <circle cx="45" cy="30" r="15.5" fill="#451A03" stroke="#F59E0B" strokeWidth="1" />
          <line x1="33" y1="42" x2="57" y2="18" stroke="#FDE68A" strokeWidth="1.8" />
          <line x1="33" y1="18" x2="57" y2="42" stroke="#FDE68A" strokeWidth="1.8" />
          <circle cx="45" cy="30" r="7" fill="#FBBF24" />
          <text
            x="45"
            y="33"
            textAnchor="middle"
            fill="#451A03"
            fontSize="8"
            fontWeight="800"
            fontFamily="serif"
          >
            ΑΘ
          </text>
        </svg>
      );

    case 'ionian_siege':
      return (
        <svg viewBox="0 0 90 60" className={className} role="img" aria-label={defaultAria}>
          <rect width="90" height="60" rx="4" fill="#7F1D1D" />
          <rect
            x="3"
            y="3"
            width="84"
            height="54"
            rx="2"
            fill="none"
            stroke="#FCA5A5"
            strokeWidth="1.4"
            strokeDasharray="6 2"
          />
          <path
            d="M16 47 L16 38 L22 38 L22 42 L28 42 L28 38 L34 38 L34 47 Z"
            fill="#FECACA"
            opacity="0.85"
          />
          <ellipse cx="52" cy="33" rx="8" ry="10" fill="#FEE2E2" />
          <circle cx="52" cy="22" r="6.8" fill="#FEF2F2" />
          <circle cx="49.5" cy="21.5" r="2.2" fill="#7F1D1D" />
          <circle cx="54.5" cy="21.5" r="2.2" fill="#7F1D1D" />
          <text x="64" y="44" fill="#FCA5A5" fontSize="8.5" fontWeight="700" fontFamily="serif">
            404
          </text>
        </svg>
      );

    default:
      return (
        <svg viewBox="0 0 90 60" className={className} role="img" aria-label={defaultAria}>
          <rect width="90" height="60" rx="4" fill="#0F172A" />
          <rect
            x="3"
            y="3"
            width="84"
            height="54"
            rx="2"
            fill="none"
            stroke="#38BDF8"
            strokeWidth="1.4"
          />
          <polygon
            points="45,12 61,20 58,42 45,49 32,42 29,20"
            fill="#1E293B"
            stroke="#7DD3FC"
            strokeWidth="1.4"
          />
          <circle cx="45" cy="30" r="5" fill="#38BDF8" />
        </svg>
      );
  }
};
