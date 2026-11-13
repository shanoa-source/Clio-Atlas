import React from 'react';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AppLanguage, OverlayLayerId, SelectedEntity } from '../types/history';
import {
  formatNumberByLang,
  formatYearByLang,
  localizeCatastrophe,
  localizeCelestialBody,
  localizePolity,
  localizeSpecies,
  localizeTerritoryName,
  localizeTransportRoute,
  UI_TEXT,
} from '../i18n/translations';
import { HistoricalFlagSvg } from './HistoricalFlagSvg';

interface EntityDetailPopoverProps {
  language: AppLanguage;
  selectedEntity: SelectedEntity | null;
  activeLayers: OverlayLayerId[];
  sidebarOpen?: boolean;
  onClose: () => void;
}

const QUANTITATIVE_SCALE_IDS: OverlayLayerId[] = [
  'mortality_catastrophe',
  'population_density',
  'night_lights',
  'transport_routes',
];

export const EntityDetailPopover: React.FC<EntityDetailPopoverProps> = ({
  language,
  selectedEntity,
  activeLayers,
  sidebarOpen = false,
  onClose,
}) => {
  const ui = UI_TEXT[language];
  const activeScaleLayers = QUANTITATIVE_SCALE_IDS.filter((id) => activeLayers.includes(id));

  const localizedPolity =
    selectedEntity?.kind === 'polity' ? localizePolity(selectedEntity.phase, language) : null;
  const localizedClickedTerritory =
    selectedEntity?.kind === 'polity' && selectedEntity.clickedTerritoryNameZh
      ? localizeTerritoryName(
          selectedEntity.clickedTerritoryId,
          selectedEntity.clickedTerritoryNameZh,
          language,
        )
      : null;
  const localizedSp =
    selectedEntity?.kind === 'species' ? localizeSpecies(selectedEntity.species, language) : null;
  const localizedRt =
    selectedEntity?.kind === 'route'
      ? localizeTransportRoute(selectedEntity.route, language)
      : null;
  const localizedCat =
    selectedEntity?.kind === 'catastrophe'
      ? localizeCatastrophe(selectedEntity.catastrophe, language)
      : null;
  const localizedCel =
    selectedEntity?.kind === 'celestial'
      ? localizeCelestialBody(selectedEntity.body, language)
      : null;

  return (
    <>
      {/* Stacked Multi-Layer Quantitative Scale Legend */}
      <AnimatePresence>
        {activeScaleLayers.length > 0 && (
          <motion.aside
            key="multi-layer-colorbar"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            aria-label={ui.scaleLegendAria}
            data-testid="quantitative-scale-legend"
            className={`pointer-events-auto fixed bottom-[174px] ${
              sidebarOpen ? 'right-3 sm:right-4 lg:right-[384px]' : 'right-3 sm:right-4'
            } z-20 w-64 max-h-[280px] overflow-y-auto atlas-scroll rounded-lg atlas-chassis atlas-reticle px-3.5 py-2.5 text-slate-200 divide-y divide-white/[0.07]`}
          >
            {activeScaleLayers.map((layerId, idx) => (
              <div key={layerId} className={idx === 0 ? 'pb-2 last:pb-0' : 'py-2 last:pb-0'}>
                {layerId === 'mortality_catastrophe' && (
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-200 mb-1">
                      <span className="font-medium">{ui.mortScaleTitle}</span>
                      <span className="font-mono tabular-nums text-slate-400">
                        {ui.mortScaleUnit}
                      </span>
                    </div>
                    <div
                      className="h-1.5 w-full rounded-[2px] ring-1 ring-inset ring-white/15"
                      style={{
                        background:
                          'linear-gradient(90deg, #FECDD3 0%, #FDA4AF 24%, #EF4444 54%, #B91C1C 78%, #54050C 100%)',
                      }}
                    />
                    <div className="flex justify-between text-[10px] text-slate-300 font-mono tabular-nums mt-1">
                      <span>{ui.mortTicks[0]}</span>
                      <span>{ui.mortTicks[1]}</span>
                      <span>{ui.mortTicks[2]}</span>
                      <span>{ui.mortTicks[3]}</span>
                    </div>
                    {activeScaleLayers.length === 1 && (
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1 pt-1 border-t border-white/[0.05]">
                        <span>{ui.mortLowLabel}</span>
                        <span>{ui.mortHighLabel}</span>
                      </div>
                    )}
                  </div>
                )}

                {layerId === 'population_density' && (
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-200 mb-1">
                      <span className="font-medium">{ui.popScaleTitle}</span>
                      <span className="font-mono tabular-nums text-slate-400">
                        {ui.popScaleUnit}
                      </span>
                    </div>
                    <div
                      className="h-1.5 w-full rounded-[2px] ring-1 ring-inset ring-white/15"
                      style={{
                        background:
                          'linear-gradient(90deg, #2563EB 0%, #3B82F6 24%, #4E86B4 45%, #A67846 68%, #7C3F18 86%, #441C0A 100%)',
                      }}
                    />
                    <div className="flex justify-between text-[10px] text-slate-300 font-mono tabular-nums mt-1">
                      <span>15</span>
                      <span>55</span>
                      <span>105</span>
                      <span>160+</span>
                    </div>
                    {activeScaleLayers.length === 1 && (
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1 pt-1 border-t border-white/[0.05]">
                        <span>{ui.popLowLabel}</span>
                        <span>{ui.popHighLabel}</span>
                      </div>
                    )}
                  </div>
                )}

                {layerId === 'night_lights' && (
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-200 mb-1">
                      <span className="font-medium">{ui.nightScaleTitle}</span>
                      <span className="font-mono tabular-nums text-slate-400">
                        {ui.nightScaleUnit}
                      </span>
                    </div>
                    <div
                      className="h-1.5 w-full rounded-[2px] ring-1 ring-inset ring-white/15"
                      style={{
                        background:
                          'linear-gradient(90deg, #78350F 0%, #D97706 30%, #F59E0B 58%, #FBBF24 80%, #FEF9C3 100%)',
                      }}
                    />
                    <div className="flex justify-between text-[10px] text-slate-300 font-mono tabular-nums mt-1">
                      <span>15</span>
                      <span>60</span>
                      <span>110</span>
                      <span>{ui.nightMaxTickUnit}</span>
                    </div>
                    {activeScaleLayers.length === 1 && (
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1 pt-1 border-t border-white/[0.05]">
                        <span>{ui.nightLowLabel}</span>
                        <span>{ui.nightHighLabel}</span>
                      </div>
                    )}
                  </div>
                )}

                {layerId === 'transport_routes' && (
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-200 mb-1">
                      <span className="font-medium">{ui.routeScaleTitle}</span>
                      <span className="font-mono tabular-nums text-slate-400">
                        {ui.routeScaleUnit}
                      </span>
                    </div>
                    <div
                      className="h-1.5 w-full rounded-[2px] ring-1 ring-inset ring-white/15"
                      style={{
                        background:
                          'linear-gradient(90deg, #FFFFFF 0%, #FECACA 34%, #F87171 64%, #DC2626 84%, #991B1B 100%)',
                      }}
                    />
                    <div className="flex justify-between text-[10px] text-slate-300 font-mono tabular-nums mt-1">
                      <span>30</span>
                      <span>150</span>
                      <span>300</span>
                      <span>450+</span>
                    </div>
                    {activeScaleLayers.length === 1 && (
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1 pt-1 border-t border-white/[0.05]">
                        <span>{ui.routeLowLabel}</span>
                        <span>{ui.routeHighLabel}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Contextual On-Click Inspector Panel */}
      <AnimatePresence>
        {selectedEntity && (
          <motion.aside
            key="entity-detail-card"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 14 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            aria-label={ui.inspectorAria}
            data-testid="entity-detail-popover"
            className={`pointer-events-auto fixed top-14 ${
              sidebarOpen ? 'right-3 sm:right-4 lg:right-[384px]' : 'right-3 sm:right-4'
            } z-20 w-84 max-w-[calc(100vw-1.5rem)] rounded-lg atlas-chassis atlas-reticle p-4 text-slate-100`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {selectedEntity.kind === 'polity' && localizedPolity && (
                  <div className="flex items-center gap-3">
                    <HistoricalFlagSvg
                      flagId={selectedEntity.phase.flagId}
                      flagSvg={selectedEntity.phase.flagSvg}
                      flagAsset={selectedEntity.phase.flagAsset}
                      label={selectedEntity.phase.flagLabel}
                      language={language}
                      className="w-11 h-7 shrink-0 rounded-[2px] ring-1 ring-white/20"
                    />
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white tracking-tight truncate">
                        {localizedPolity.name}
                      </h3>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {localizedPolity.secondaryName}
                      </p>
                    </div>
                  </div>
                )}

                {selectedEntity.kind === 'species' && localizedSp && (
                  <div>
                    <h3 className="text-sm font-semibold text-emerald-200 tracking-tight">
                      {localizedSp.commonName}
                    </h3>
                    <p className="text-xs italic text-slate-400 mt-0.5">
                      {selectedEntity.species.scientificName} ·{' '}
                      {selectedEntity.species.classicalSourceName}
                    </p>
                  </div>
                )}

                {selectedEntity.kind === 'route' && localizedRt && (
                  <div>
                    <h3 className="text-sm font-semibold text-white tracking-tight">
                      {localizedRt.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {localizedRt.origin} → {localizedRt.destination}
                    </p>
                  </div>
                )}

                {selectedEntity.kind === 'catastrophe' && localizedCat && (
                  <div>
                    <h3 className="text-sm font-semibold text-red-300 tracking-tight">
                      {localizedCat.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">{localizedCat.location}</p>
                  </div>
                )}

                {selectedEntity.kind === 'celestial' && localizedCel && (
                  <div>
                    <h3 className="text-sm font-semibold text-white tracking-tight">
                      {localizedCel.name} · {localizedCel.secondaryName}
                    </h3>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0"
                aria-label={ui.closeInspectorAria}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-3.5 pt-3 border-t border-white/[0.07] text-xs text-slate-300 space-y-2 leading-relaxed">
              {selectedEntity.kind === 'polity' && localizedPolity && (
                <>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400 font-mono tabular-nums">
                    <span className="whitespace-nowrap text-sky-300">
                      {selectedEntity.phase.startYear < 0 && selectedEntity.phase.endYear < 0
                        ? language === 'de'
                          ? `${Math.abs(selectedEntity.phase.startYear)}–${Math.abs(selectedEntity.phase.endYear)} v. Chr.`
                          : `${Math.abs(selectedEntity.phase.startYear)}–${Math.abs(selectedEntity.phase.endYear)} BCE`
                        : `${formatYearByLang(selectedEntity.phase.startYear, language, true)} – ${formatYearByLang(
                            selectedEntity.phase.endYear,
                            language,
                            true,
                          )}`}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="whitespace-nowrap">
                      {ui.controlledTerritories(selectedEntity.regionCount)}
                    </span>
                    {selectedEntity.phase.boundaryMode === 'unbounded' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-300/90 font-sans">
                          {ui.unboundedSphereLabel}
                        </span>
                      </>
                    )}
                  </div>
                  {localizedClickedTerritory && (
                    <div className="text-slate-200 font-medium">
                      {ui.clickedTerritoryLabel}
                      {localizedClickedTerritory}
                    </div>
                  )}
                  <p>{localizedPolity.summary}</p>
                  <div className="text-[11px] text-slate-500 pt-1 border-t border-white/[0.05]">
                    {ui.sourceCitationLabel}
                    {selectedEntity.phase.sourceCitation}
                  </div>
                </>
              )}

              {selectedEntity.kind === 'species' && localizedSp && (
                <>
                  <div className="text-slate-400">
                    {ui.recordedScholarLabel}
                    {localizedSp.discoverer} ·{' '}
                    <span className="font-mono tabular-nums text-emerald-300">
                      {formatYearByLang(selectedEntity.species.discoveryYear, language)}
                    </span>
                  </div>
                  <div className="text-slate-400">
                    {ui.surveyLocationLabel}
                    {localizedSp.location}
                  </div>
                  <p>{localizedSp.note}</p>
                  <div className="text-[11px] text-slate-500 pt-1 border-t border-white/[0.05]">
                    {ui.sourceCitationLabel}
                    {selectedEntity.species.sourceCitation}
                  </div>
                </>
              )}

              {selectedEntity.kind === 'route' && localizedRt && (
                <>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>{ui.annualRouteIntensityLabel}</span>
                    <span className="font-mono tabular-nums text-white font-semibold">
                      {ui.annualVoyagesValue(selectedEntity.annualTrips)}
                    </span>
                  </div>
                  <p>
                    {ui.cargoLabel}
                    {localizedRt.cargo}
                  </p>
                  <div className="text-[11px] text-slate-500 pt-1 border-t border-white/[0.05]">
                    {ui.sourceCitationLabel}
                    {selectedEntity.route.sourceCitation}
                  </div>
                </>
              )}

              {selectedEntity.kind === 'catastrophe' && localizedCat && (
                <>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>{ui.estimatedDeathsLabel}</span>
                    <span className="font-mono tabular-nums text-red-300 font-semibold">
                      {ui.estimatedDeathsValue(
                        formatNumberByLang(selectedEntity.catastrophe.estimatedDeaths, language),
                      )}
                    </span>
                  </div>
                  <p>{localizedCat.note}</p>
                  <div className="text-[11px] text-slate-500 pt-1 border-t border-white/[0.05]">
                    {ui.sourceCitationLabel}
                    {selectedEntity.catastrophe.sourceCitation}
                  </div>
                </>
              )}

              {selectedEntity.kind === 'celestial' && localizedCel && (
                <p>{localizedCel.description}</p>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
};
