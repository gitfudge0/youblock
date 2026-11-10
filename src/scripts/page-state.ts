/** Shared contract for YouBlock's independently authored page modules. */
export interface PageSettings {
  filterData: Record<string, unknown>;
  options: Record<string, unknown>;
}
export interface PageState {
  settings?: PageSettings;
  enabled: boolean;
  generation: number;
  ready: Promise<void>;
  transformPlayerData?: (root: unknown) => void;
}
