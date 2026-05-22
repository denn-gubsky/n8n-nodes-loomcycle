/**
 * Vitest test setup.
 *
 * Sub-phase 2.0 ships only the LoomCycleApi credential, which is exercised
 * with shape assertions (no network calls). Mock surfaces for
 * IExecuteFunctions / ITriggerFunctions / ISupplyDataFunctions land
 * in sub-phase 2.1 when the first action node arrives.
 *
 * This file exists so vitest.config.ts has a setupFiles target to reference;
 * extensions land here as additional sub-phases need shared test fixtures.
 */
export {};
