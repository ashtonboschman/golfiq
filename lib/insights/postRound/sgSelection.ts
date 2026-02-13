import { POST_ROUND_RESIDUAL } from '@/lib/insights/config/postRound';
import type { SgMeasuredComponentName } from '@/lib/insights/types';

export type MeasuredSgInputs = {
  offTee: number | null;
  approach: number | null;
  putting: number | null;
  penalties: number | null;
  residual: number | null;
  total: number | null;
};

export type MeasuredSgComponent = {
  name: SgMeasuredComponentName;
  label: string;
  value: number;
};

export type MeasuredSgSelection = {
  components: MeasuredSgComponent[];
  best: MeasuredSgComponent | null;
  opportunity: MeasuredSgComponent | null;
  opportunityIsWeak: boolean;
  componentCount: number;
  residualDominant: boolean;
  weakSeparation: boolean;
};

const COMPONENT_LABELS: Record<SgMeasuredComponentName, string> = {
  off_tee: 'Off The Tee',
  approach: 'Approach',
  putting: 'Putting',
  penalties: 'Penalties',
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function buildMeasuredComponents(inputs: MeasuredSgInputs): MeasuredSgComponent[] {
  const components: MeasuredSgComponent[] = [];
  if (isFiniteNumber(inputs.offTee)) {
    components.push({ name: 'off_tee', label: COMPONENT_LABELS.off_tee, value: inputs.offTee });
  }
  if (isFiniteNumber(inputs.approach)) {
    components.push({ name: 'approach', label: COMPONENT_LABELS.approach, value: inputs.approach });
  }
  if (isFiniteNumber(inputs.putting)) {
    components.push({ name: 'putting', label: COMPONENT_LABELS.putting, value: inputs.putting });
  }
  if (isFiniteNumber(inputs.penalties)) {
    components.push({ name: 'penalties', label: COMPONENT_LABELS.penalties, value: inputs.penalties });
  }
  return components;
}

function pickBestComponent(components: MeasuredSgComponent[]): MeasuredSgComponent | null {
  if (components.length === 0) return null;
  return [...components].sort((a, b) => b.value - a.value)[0];
}

function pickOpportunityComponent(
  components: MeasuredSgComponent[],
  best: MeasuredSgComponent | null,
): MeasuredSgComponent | null {
  if (components.length === 0) return null;
  const worst = [...components].sort((a, b) => a.value - b.value)[0];
  if (!best || worst.name !== best.name) return worst;

  const alternatives = components.filter((component) => component.name !== best.name);
  if (!alternatives.length) return worst;
  return alternatives.sort((a, b) => a.value - b.value)[0];
}

function computeResidualDominant(inputs: MeasuredSgInputs, components: MeasuredSgComponent[]): boolean {
  if (!isFiniteNumber(inputs.residual) || !isFiniteNumber(inputs.total)) return false;

  const residualAbs = Math.abs(inputs.residual);
  if (residualAbs < POST_ROUND_RESIDUAL.dominanceAbsoluteFloor) return false;

  const maxMeasuredAbs = components.length
    ? Math.max(...components.map((component) => Math.abs(component.value)))
    : 0;
  const totalAbs = Math.max(Math.abs(inputs.total), 0.001);

  return residualAbs > maxMeasuredAbs || residualAbs / totalAbs >= POST_ROUND_RESIDUAL.dominanceRatio;
}

function computeWeakSeparation(components: MeasuredSgComponent[]): boolean {
  if (components.length < 2) return false;
  const sorted = [...components].sort((a, b) => a.value - b.value);
  const delta = Math.abs(sorted[0].value - sorted[1].value);
  return delta < POST_ROUND_RESIDUAL.weakSeparationDelta;
}

export function runMeasuredSgSelection(
  inputs: MeasuredSgInputs,
  weaknessThreshold: number,
): MeasuredSgSelection {
  const components = buildMeasuredComponents(inputs);
  const best = pickBestComponent(components);
  const opportunity = pickOpportunityComponent(components, best);

  return {
    components,
    best,
    opportunity,
    opportunityIsWeak: Boolean(opportunity && opportunity.value <= weaknessThreshold),
    componentCount: components.length,
    residualDominant: computeResidualDominant(inputs, components),
    weakSeparation: computeWeakSeparation(components),
  };
}
