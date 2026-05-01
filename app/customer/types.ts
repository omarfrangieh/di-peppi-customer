export interface MapLocation {
  lat: number;
  lng: number;
}

export interface SavedAddress {
  id: string;
  label: string;
  address: string;
  mapLocation: MapLocation | null;
}
