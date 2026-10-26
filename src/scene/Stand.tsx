import { AxleHousingModel, PedestalModel, WithFallback } from './models';

/**
 * Static parts that never turn with the wheel: the pedestal (plinth,
 * column and pointer mast) and the axle housing behind the wheel.
 */
export function Stand() {
  return (
    <WithFallback>
      <PedestalModel />
      <AxleHousingModel />
    </WithFallback>
  );
}
