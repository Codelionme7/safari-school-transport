import React, { useState } from 'react';
import { Layers, LocateFixed, MapPin } from 'lucide-react';
import {
  RouteDefinition,
  ShiftMode,
  VehicleTelemetry,
} from '../types/safari';
import { SCHOOL_CAMPUS_NAME, SCHOOL_CAMPUS_POINT } from '../data/syntheticData';
import { formatGpsCoords, interpolateAlongWaypoints } from '../engine/simulation';

interface SyntheticRouteMapProps {
  mode: 'parent' | 'school';
  routes: RouteDefinition[];
  telemetry: Record<string, VehicleTelemetry>;
  shift: ShiftMode;
  selectedRouteId?: string;
  highlightedStopId?: string;
  onSelectRoute?: (routeId: string) => void;
  hiddenStopCount?: number;
  hiddenBusCount?: number;
}

export const SyntheticRouteMap: React.FC<SyntheticRouteMapProps> = ({
  mode,
  routes,
  telemetry,
  shift,
  selectedRouteId,
  highlightedStopId,
  onSelectRoute,
  hiddenStopCount = 0,
  hiddenBusCount = 0,
}) => {
  const [showTrafficLayer, setShowTrafficLayer] = useState(true);
  const [pulseFocus, setPulseFocus] = useState(false);

  const focusedRoute =
    selectedRouteId ? routes.find((r) => r.id === selectedRouteId) : routes[0];
  const focusedTelemetry = focusedRoute ? telemetry[focusedRoute.id] : undefined;

  const handleRecenter = () => {
    setPulseFocus(true);
    window.setTimeout(() => setPulseFocus(false), 650);
  };

  return (
    <div
      data-testid="synthetic-route-map"
      className="glass-card relative w-full overflow-hidden rounded-[24px]"
    >
      {/* Top Frosted Map Caption Bar */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-[#E5E7EB]/80 bg-white/75 px-5 py-3 text-xs text-[#64748B] backdrop-blur-md dark:border-white/10 dark:bg-[#111827]/75 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-bold text-[#111827] whitespace-nowrap dark:text-white">
            {mode === 'parent'
              ? 'Scoped Family Route'
              : 'Oakridge Live Fleet GPS'}
          </span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap">
            {shift === 'morning' ? 'Morning Pickup' : 'Afternoon Drop-Off'}
          </span>
          <span aria-hidden="true" className="hidden sm:inline">·</span>
          <span className="hidden whitespace-nowrap sm:inline">
            {showTrafficLayer ? 'Live Traffic Layer' : 'Traffic Hidden'}
          </span>
        </div>

        {mode === 'parent' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-[11px] font-semibold text-[#111827] dark:bg-white/10 dark:text-slate-200">
            <span>Privacy scoped</span>
            <span aria-hidden="true">·</span>
            <span className="text-[#64748B] dark:text-slate-400">
              {hiddenStopCount} stops &amp; {hiddenBusCount} buses hidden
            </span>
          </span>
        ) : (
          <span className="font-mono-tabular rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-[11px] font-semibold text-[#111827] whitespace-nowrap dark:bg-white/10 dark:text-slate-200">
            {focusedRoute && focusedTelemetry
              ? `${focusedRoute.vehicleLabel}: ${formatGpsCoords(focusedTelemetry.gpsCoords)} · ${focusedTelemetry.speedKmh} km/h`
              : `${routes.length} active vehicles`}
          </span>
        )}
      </div>

      {/* Executive Monochrome Grayscale Vector Map Canvas */}
      <div className="relative aspect-[16/10] w-full select-none bg-[#ECEEF1] dark:bg-[#0D121C]">
        <svg
          viewBox="0 0 960 600"
          className="h-full w-full"
          role="img"
          aria-label={
            mode === 'parent'
              ? 'Privacy-scoped live GPS map showing your child’s assigned bus, traffic corridor, and stop geofence'
              : 'School transport operations live GPS map showing all active buses, traffic corridors, stops, and Oakridge Academy'
          }
        >
          {/* Base Executive Monochrome Surface */}
          <rect
            x="0"
            y="0"
            width="960"
            height="600"
            className="fill-[#ECEEF1] dark:fill-[#0D121C]"
          />

          {/* Clean Grayscale Urban Blocks (Image_7 aesthetic) */}
          <g className="fill-[#F6F7F9] dark:fill-[#141B29]">
            <rect x="36" y="36" width="210" height="118" rx="14" />
            <rect x="280" y="36" width="205" height="106" rx="14" />
            <rect x="520" y="42" width="185" height="122" rx="14" />
            <rect x="740" y="36" width="184" height="115" rx="14" />
            <rect x="36" y="192" width="185" height="124" rx="14" />
            <rect x="260" y="192" width="220" height="118" rx="14" />
            <rect x="525" y="205" width="175" height="112" rx="14" />
            <rect x="745" y="195" width="178" height="126" rx="14" />
            <rect x="40" y="368" width="200" height="120" rx="14" />
            <rect x="295" y="395" width="188" height="132" rx="14" />
            <rect x="545" y="370" width="170" height="118" rx="14" />
          </g>

          {/* Subtle Monochrome River / Greenbelt Ribbon */}
          <path
            d="M 0 568 Q 220 538, 420 502 T 860 438 T 960 388"
            fill="none"
            strokeWidth="24"
            strokeLinecap="round"
            className="stroke-[#E2E6EC] dark:stroke-[#182234]"
          />

          {/* Crisp White Road Ribbons (Signature Image_7 Monochrome Roads) */}
          <g
            fill="none"
            strokeLinecap="round"
            className="stroke-white dark:stroke-[#1F2937]"
          >
            <path d="M 0 168 L 960 172" strokeWidth="14" />
            <path d="M 0 342 L 960 346" strokeWidth="16" />
            <path d="M 0 492 L 960 472" strokeWidth="12" />
            <path d="M 248 0 L 252 600" strokeWidth="14" />
            <path d="M 505 0 L 512 600" strokeWidth="16" />
            <path d="M 724 0 L 728 600" strokeWidth="14" />
            <path d="M 90 600 C 170 460, 290 360, 480 285 S 760 190, 860 0" strokeWidth="20" />
          </g>

          {/* Subtle Neighborhood District Labels */}
          <g className="fill-[#9CA3AF] text-[11px] font-semibold tracking-wide dark:fill-slate-600">
            <text x="64" y="84">North Ridge</text>
            <text x="82" y="255">West Meadow</text>
            <text x="86" y="425">Riverbend</text>
            <text x="556" y="102">Hillcrest</text>
            <text x="582" y="422">Southgate</text>
          </g>

          {/* Route Polylines, Traffic Overlays & Stops */}
          {routes.map((route, routeIdx) => {
            const vehicle = telemetry[route.id];
            const isSelected =
              mode === 'parent' || !selectedRouteId || selectedRouteId === route.id;
            const pointsAttr = route.waypoints.map((p) => `${p.x},${p.y}`).join(' ');

            const expectedPos = vehicle
              ? interpolateAlongWaypoints(route.waypoints, vehicle.progress, shift).position
              : null;

            const showDeviationAlert =
              mode === 'school' && vehicle && vehicle.state === 'deviated';

            // Executive Monochrome palette: primary obsidian #111827 for focused/parent route,
            // refined slate tones for secondary routes, with clear semantic amber/crimson dashed overlays for traffic
            const monoStroke =
              mode === 'parent' || selectedRouteId === route.id
                ? '#111827'
                : routeIdx === 0
                ? '#111827'
                : routeIdx === 1
                ? '#374151'
                : routeIdx === 2
                ? '#4B5563'
                : '#1F2937';

            const trafficStrokeColor =
              route.trafficLevel === 'heavy'
                ? '#DC2626'
                : route.trafficLevel === 'moderate'
                ? '#D97706'
                : monoStroke;

            return (
              <g key={route.id} opacity={isSelected ? 1 : 0.3}>
                {/* Corridor Soft Halo */}
                <polyline
                  points={pointsAttr}
                  fill="none"
                  stroke={showTrafficLayer ? trafficStrokeColor : monoStroke}
                  strokeWidth={
                    showTrafficLayer && route.trafficLevel !== 'clear' ? 14 : 10
                  }
                  strokeOpacity={
                    showTrafficLayer && route.trafficLevel !== 'clear' ? 0.16 : 0.08
                  }
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Main Executive Route Polyline */}
                <polyline
                  points={pointsAttr}
                  fill="none"
                  stroke={monoStroke}
                  strokeWidth={isSelected ? 4 : 2.5}
                  strokeDasharray={mode === 'parent' ? '6 4' : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="dark:stroke-slate-200"
                />

                {/* Live Traffic Congestion Overlay Dashes */}
                {showTrafficLayer && route.trafficLevel !== 'clear' && (
                  <polyline
                    points={pointsAttr}
                    fill="none"
                    stroke={trafficStrokeColor}
                    strokeWidth={isSelected ? 3.5 : 2.5}
                    strokeDasharray={route.trafficLevel === 'heavy' ? '8 6' : '5 9'}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Pickup / Drop-Off Stops + Geofence Rings */}
                {route.stops
                  .filter((s) => !s.isSchoolCampus)
                  .map((stop) => {
                    const isHighlighted = stop.id === highlightedStopId;
                    return (
                      <g key={stop.id}>
                        {(isHighlighted || mode === 'school') && (
                          <circle
                            cx={stop.position.x}
                            cy={stop.position.y}
                            r={isHighlighted ? stop.geofenceRadiusPx : 18}
                            fill="#111827"
                            fillOpacity={isHighlighted ? 0.08 : 0.03}
                            stroke="#111827"
                            strokeOpacity={isHighlighted ? 0.45 : 0.2}
                            strokeWidth="1.25"
                            strokeDasharray="4 4"
                            className="dark:fill-white dark:stroke-slate-400"
                          />
                        )}
                        <circle
                          cx={stop.position.x}
                          cy={stop.position.y}
                          r={isHighlighted ? 8 : 5.5}
                          className={
                            isHighlighted
                              ? 'fill-[#111827] stroke-white dark:fill-white dark:stroke-[#111827]'
                              : 'fill-white stroke-[#111827] dark:fill-[#111827] dark:stroke-slate-300'
                          }
                          strokeWidth={isHighlighted ? 2.5 : 2}
                        />
                        {isHighlighted && (
                          <circle
                            cx={stop.position.x}
                            cy={stop.position.y}
                            r="2.5"
                            className="fill-white dark:fill-[#111827]"
                          />
                        )}
                        <text
                          x={stop.position.x}
                          y={stop.position.y - (isHighlighted ? 16 : 12)}
                          textAnchor="middle"
                          style={{ paintOrder: 'stroke' }}
                          className={
                            isHighlighted
                              ? 'fill-[#111827] stroke-white stroke-[4px] text-[12px] font-bold dark:fill-white dark:stroke-[#0D121C]'
                              : 'fill-[#4B5563] stroke-[#ECEEF1] stroke-[3px] text-[10.5px] font-semibold dark:fill-slate-300 dark:stroke-[#0D121C]'
                          }
                        >
                          {stop.name}
                        </text>
                      </g>
                    );
                  })}

                {/* Deviation Alert Tether (School Operations only) */}
                {showDeviationAlert && expectedPos && (
                  <g>
                    <line
                      x1={expectedPos.x}
                      y1={expectedPos.y}
                      x2={vehicle.position.x}
                      y2={vehicle.position.y}
                      stroke="#DC2626"
                      strokeWidth="2"
                      strokeDasharray="4 3"
                    />
                    <circle
                      cx={vehicle.position.x}
                      cy={vehicle.position.y}
                      r="24"
                      fill="#DC2626"
                      fillOpacity="0.14"
                      stroke="#DC2626"
                      strokeWidth="1.5"
                    />
                  </g>
                )}

                {/* Executive Monochrome Vehicle Marker + Dark Pill Callout */}
                {vehicle && (
                  <g
                    transform={`translate(${
                      mode === 'parent' && expectedPos && vehicle.state === 'deviated'
                        ? expectedPos.x
                        : vehicle.position.x
                    }, ${
                      mode === 'parent' && expectedPos && vehicle.state === 'deviated'
                        ? expectedPos.y
                        : vehicle.position.y
                    })`}
                    onClick={() => onSelectRoute?.(route.id)}
                    className={onSelectRoute ? 'cursor-pointer' : undefined}
                    role={onSelectRoute ? 'button' : undefined}
                    tabIndex={onSelectRoute ? 0 : undefined}
                    aria-label={`${route.vehicleLabel} on ${route.name}, ${route.trafficLevel} traffic, status ${vehicle.state.replace('_', ' ')}`}
                    onKeyDown={(e) => {
                      if (onSelectRoute && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onSelectRoute(route.id);
                      }
                    }}
                  >
                    {/* Focus ring on recenter */}
                    {pulseFocus && (
                      <circle
                        r="26"
                        fill="#111827"
                        fillOpacity="0.12"
                        stroke="#111827"
                        strokeOpacity="0.35"
                        strokeWidth="1.5"
                      />
                    )}

                    {/* Heading Pointer */}
                    <g transform={`rotate(${vehicle.headingDeg})`}>
                      <polygon
                        points="22,0 13,-6.5 13,6.5"
                        fill={
                          showDeviationAlert
                            ? '#DC2626'
                            : vehicle.state === 'delayed' ||
                              vehicle.state === 'gps_degraded' ||
                              vehicle.state === 'deviated'
                            ? '#D97706'
                            : '#111827'
                        }
                      />
                    </g>

                    {/* Circular Obsidian Bus Badge (Image_7 style) */}
                    <circle
                      r="15"
                      fill={
                        showDeviationAlert
                          ? '#DC2626'
                          : vehicle.state === 'delayed' ||
                            vehicle.state === 'gps_degraded' ||
                            vehicle.state === 'deviated'
                          ? '#D97706'
                          : '#111827'
                      }
                      stroke="#FFFFFF"
                      strokeWidth="2.5"
                    />
                    <text
                      y="3.5"
                      textAnchor="middle"
                      className="fill-white text-[10px] font-extrabold"
                    >
                      {route.code.split('-')[1] ?? route.code.slice(0, 2)}
                    </text>

                    {/* Crisp Dark Pill Callout */}
                    <g transform="translate(0, 27)">
                      <rect
                        x="-62"
                        y="-10.5"
                        width="124"
                        height="21"
                        rx="10.5"
                        fill="#111827"
                        stroke="#FFFFFF"
                        strokeOpacity="0.85"
                        strokeWidth="1"
                      />
                      <text
                        y="3.5"
                        textAnchor="middle"
                        className="fill-white text-[10px] font-bold"
                      >
                        {route.vehicleLabel} ·{' '}
                        {vehicle.state === 'completed'
                          ? 'Arrived'
                          : showDeviationAlert
                          ? 'Off Route'
                          : vehicle.state === 'deviated'
                          ? 'Checking'
                          : vehicle.state === 'delayed'
                          ? `+${vehicle.delayMinutes}m`
                          : vehicle.state === 'gps_degraded'
                          ? 'GPS Stale'
                          : `${vehicle.speedKmh} km/h · ${vehicle.etaToNextStopMin}m`}
                      </text>
                    </g>
                  </g>
                )}
              </g>
            );
          })}

          {/* School Campus Landmark */}
          <g transform={`translate(${SCHOOL_CAMPUS_POINT.x}, ${SCHOOL_CAMPUS_POINT.y})`}>
            <circle
              r="30"
              className="fill-[#111827]/6 stroke-[#111827]/30 dark:fill-white/10 dark:stroke-white/30"
              strokeWidth="1.25"
              strokeDasharray="3 3"
            />
            <rect
              x="-16"
              y="-16"
              width="32"
              height="32"
              rx="10"
              className="fill-[#111827] stroke-white dark:fill-white dark:stroke-[#111827]"
              strokeWidth="2"
            />
            <path
              d="M -7 0 L 0 -6 L 7 0 M -5 0 L -5 6 L 5 6 L 5 0"
              fill="none"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-white dark:stroke-[#111827]"
            />
            <text
              y="33"
              textAnchor="middle"
              style={{ paintOrder: 'stroke' }}
              className="fill-[#111827] stroke-white stroke-[4px] text-[11.5px] font-extrabold dark:fill-white dark:stroke-[#0D121C]"
            >
              {SCHOOL_CAMPUS_NAME}
            </text>
          </g>
        </svg>

        {/* Floating Map Location Pill (Image_7 Bottom-Left) */}
        <div className="pointer-events-none absolute bottom-3 left-3 hidden items-center gap-1.5 rounded-full border border-white/90 bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-[#111827] shadow-sm backdrop-blur-md sm:flex dark:border-white/15 dark:bg-[#111827]/90 dark:text-slate-100">
          <MapPin className="h-3.5 w-3.5 text-[#111827] dark:text-white" aria-hidden="true" />
          <span>Oakridge Corridor · Safe Geofence Zone</span>
        </div>

        {/* Floating Map Controls (Image_7 Bottom-Right) */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={handleRecenter}
            aria-label="Center on active bus"
            className="btn-spring flex h-9 w-9 items-center justify-center rounded-full border border-white/90 bg-white/95 text-[#111827] shadow-md backdrop-blur-md hover:bg-[#F3F4F6] dark:border-white/15 dark:bg-[#111827]/95 dark:text-white dark:hover:bg-[#1F2937]"
          >
            <LocateFixed className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setShowTrafficLayer((prev) => !prev)}
            aria-label={showTrafficLayer ? 'Hide traffic layer' : 'Show traffic layer'}
            aria-pressed={showTrafficLayer}
            className={`btn-spring flex h-9 w-9 items-center justify-center rounded-full border shadow-md backdrop-blur-md transition-colors ${
              showTrafficLayer
                ? 'border-[#111827] bg-[#111827] text-white dark:border-white dark:bg-white dark:text-[#111827]'
                : 'border-white/90 bg-white/95 text-[#111827] hover:bg-[#F3F4F6] dark:border-white/15 dark:bg-[#111827]/95 dark:text-white'
            }`}
          >
            <Layers className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Clean Map Legend Footer */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-[#E5E7EB]/80 bg-white/75 px-5 py-2.5 text-[11px] text-[#64748B] backdrop-blur-md dark:border-white/10 dark:bg-[#111827]/75 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5 font-medium text-[#111827] dark:text-slate-200">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#111827] dark:bg-white" aria-hidden="true" />
            <span>School Bus</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[#111827] bg-white dark:border-slate-300 dark:bg-[#111827]" aria-hidden="true" />
            <span>Pickup / Drop-Off Stop</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[#111827] dark:bg-white" aria-hidden="true" />
            <span>Oakridge Campus</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span>Traffic:</span>
          <span className="font-semibold text-[#111827] dark:text-slate-200">Clear</span>
          <span aria-hidden="true">·</span>
          <span className="font-semibold text-amber-700 dark:text-amber-400">Moderate (dashed)</span>
          <span aria-hidden="true">·</span>
          <span className="font-semibold text-red-700 dark:text-red-400">Heavy (dashed)</span>
        </div>
      </div>
    </div>
  );
};
