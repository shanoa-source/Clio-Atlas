import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AppLanguage } from '../types/history';
import { UI_TEXT } from '../i18n/translations';
import { OsmLoadingSnapshot } from '../services/osmBoundaryService';

interface AtlasBootOverlayProps {
  language: AppLanguage;
  visible: boolean;
  mapStyleReady?: boolean;
  parcelsRendered?: boolean;
  osmSnapshot?: OsmLoadingSnapshot;
}

const TICKS_36 = Array.from({ length: 36 }, (_, i) => i * 10);

export const AtlasBootOverlay: React.FC<AtlasBootOverlayProps> = ({
  language,
  visible,
}) => {
  const ui = UI_TEXT[language];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="atlas-boot-overlay"
          role="status"
          aria-live="polite"
          aria-label={ui.bootAriaLabel}
          data-testid="atlas-boot-overlay"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#04060B] select-none overflow-hidden"
        >
          {/* Subtle Astrometric Meridian Background Field */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(circle at 50% 50%, rgba(14, 165, 233, 0.09) 0%, rgba(4, 6, 11, 0) 56%), linear-gradient(rgba(148, 163, 184, 0.026) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.026) 1px, transparent 1px)',
              backgroundSize: '100% 100%, 64px 64px, 64px 64px',
              backgroundPosition: 'center center',
            }}
          />

          {/* Pure 3D Geodesic Earth + Rotating Astrometric Compass Animation */}
          <div className="relative w-56 h-56 flex items-center justify-center">
            {/* Outer Rotating Vernier Compass Ring */}
            <svg
              viewBox="0 0 220 220"
              className="absolute inset-0 w-full h-full animate-atlas-orbit"
              aria-hidden="true"
            >
              <circle
                cx="110"
                cy="110"
                r="102"
                fill="none"
                stroke="rgba(148, 163, 184, 0.14)"
                strokeWidth="0.8"
                strokeDasharray="2 6"
              />
              {TICKS_36.map((deg) => {
                const isCardinal = deg % 90 === 0;
                const isMajor = deg % 30 === 0;
                return (
                  <g key={deg} transform={`rotate(${deg} 110 110)`}>
                    <line
                      x1="110"
                      y1={isCardinal ? 4 : isMajor ? 7 : 9}
                      x2="110"
                      y2={isCardinal ? 16 : isMajor ? 14 : 13}
                      stroke={
                        isCardinal
                          ? 'rgba(56, 189, 248, 0.85)'
                          : isMajor
                            ? 'rgba(148, 163, 184, 0.42)'
                            : 'rgba(148, 163, 184, 0.2)'
                      }
                      strokeWidth={isCardinal ? '1.4' : '0.8'}
                    />
                    {isCardinal && (
                      <polygon
                        points="110,19 107.6,23.5 112.4,23.5"
                        fill="rgba(56, 189, 248, 0.72)"
                      />
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Counter-Rotating Ecliptic Compass Gimbal */}
            <svg
              viewBox="0 0 220 220"
              className="absolute inset-0 w-full h-full animate-atlas-orbit-reverse"
              aria-hidden="true"
            >
              <circle
                cx="110"
                cy="110"
                r="82"
                fill="none"
                stroke="rgba(56, 189, 248, 0.28)"
                strokeWidth="1"
                strokeDasharray="26 10 5 10"
              />
              <circle
                cx="110"
                cy="110"
                r="68"
                fill="none"
                stroke="rgba(148, 163, 184, 0.14)"
                strokeWidth="0.75"
                strokeDasharray="12 8"
              />
              {/* Compass Gimbal Nodes */}
              <circle cx="110" cy="28" r="2.2" fill="#38BDF8" />
              <circle cx="110" cy="192" r="1.8" fill="rgba(148, 163, 184, 0.6)" />
            </svg>

            {/* Geodesic Earth Wire-Sphere & Prime Meridians */}
            <svg viewBox="0 0 220 220" className="relative w-full h-full" aria-hidden="true">
              <g>
                <circle
                  cx="110"
                  cy="110"
                  r="50"
                  fill="rgba(8, 15, 28, 0.76)"
                  stroke="rgba(56, 189, 248, 0.52)"
                  strokeWidth="1.15"
                />
                {/* Parallels */}
                <ellipse
                  cx="110"
                  cy="110"
                  rx="50"
                  ry="17"
                  fill="none"
                  stroke="rgba(148, 163, 184, 0.25)"
                  strokeWidth="0.8"
                />
                <ellipse
                  cx="110"
                  cy="110"
                  rx="50"
                  ry="35"
                  fill="none"
                  stroke="rgba(148, 163, 184, 0.18)"
                  strokeWidth="0.8"
                />
                {/* Meridians */}
                <ellipse
                  cx="110"
                  cy="110"
                  rx="18"
                  ry="50"
                  fill="none"
                  stroke="rgba(56, 189, 248, 0.32)"
                  strokeWidth="0.85"
                />
                <ellipse
                  cx="110"
                  cy="110"
                  rx="37"
                  ry="50"
                  fill="none"
                  stroke="rgba(148, 163, 184, 0.2)"
                  strokeWidth="0.8"
                />
                {/* Prime Compass Crosshair */}
                <line
                  x1="54"
                  y1="110"
                  x2="166"
                  y2="110"
                  stroke="rgba(56, 189, 248, 0.34)"
                  strokeWidth="0.8"
                />
                <line
                  x1="110"
                  y1="54"
                  x2="110"
                  y2="166"
                  stroke="rgba(56, 189, 248, 0.34)"
                  strokeWidth="0.8"
                />
                {/* Calibration Target Reticle */}
                <circle cx="122" cy="92" r="2.6" fill="#38BDF8" />
                <circle
                  cx="122"
                  cy="92"
                  r="6.8"
                  fill="none"
                  stroke="rgba(56, 189, 248, 0.58)"
                  strokeWidth="0.85"
                />
              </g>
            </svg>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
