export type MeasurementUnit = "celsius" | "fahrenheit";
export type MeasurementMethod = "rectal" | "axillary" | "oral" | "tympanic" | "temporal" | "unknown";

export const TEMPERATURE_UNITS: ReadonlyMap<string, MeasurementUnit> = new Map([
  ["c", "celsius"], ["°c", "celsius"], ["ºc", "celsius"], ["celsius", "celsius"],
  ["f", "fahrenheit"], ["°f", "fahrenheit"], ["ºf", "fahrenheit"], ["fahrenheit", "fahrenheit"],
]);

export const MEASUREMENT_METHODS: ReadonlyMap<string, MeasurementMethod> = new Map([
  ["rectal", "rectal"], ["rectalmente", "rectal"], ["axillary", "axillary"], ["axilar", "axillary"],
  ["oral", "oral"], ["tympanic", "tympanic"], ["timpánica", "tympanic"], ["temporal", "temporal"],
]);
