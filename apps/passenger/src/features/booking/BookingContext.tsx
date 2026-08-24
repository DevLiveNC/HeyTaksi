import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import type { Coordinate, DispatchStatusView, RouteEstimate, VehicleType } from "@heytaksi/shared";
export interface ActiveRide {
  id: string;
  status: string;
  vehicleType: string;
  pickupAddress: string;
  destinationAddress: string;
  distanceMeters: number;
  durationSeconds: number;
  estimatedFare: string;
  finalFare?: string | null;
  geometry: RouteEstimate["geometry"];
  driverName?: string | null;
  vehicle?: string | null;
  plate?: string | null;
  driverLocation?: { latitude: number; longitude: number; heading?: number | null };
  /** Faz 6: sunucudan gelen canlı dağıtım arama durumu. */
  dispatch?: DispatchStatusView | null;
}
interface BookingValue {
  pickup: Coordinate | null;
  destination: Coordinate | null;
  route: RouteEstimate | null;
  vehicleType: VehicleType;
  activeRide: ActiveRide | null;
  setPickup(v: Coordinate | null): void;
  setDestination(v: Coordinate | null): void;
  setRoute(v: RouteEstimate | null): void;
  setVehicleType(v: VehicleType): void;
  setActiveRide(v: ActiveRide | null): void;
}
const Context = createContext<BookingValue | null>(null);
export function BookingProvider({ children }: PropsWithChildren) {
  const [pickup, setPickup] = useState<Coordinate | null>(null);
  const [destination, setDestination] = useState<Coordinate | null>(null);
  const [route, setRoute] = useState<RouteEstimate | null>(null);
  const [vehicleType, setVehicleType] = useState<VehicleType>("standard");
  const [activeRide, setActiveRide] = useState<ActiveRide | null>(null);
  const value = useMemo(
    () => ({
      pickup,
      destination,
      route,
      vehicleType,
      activeRide,
      setPickup,
      setDestination,
      setRoute,
      setVehicleType,
      setActiveRide,
    }),
    [pickup, destination, route, vehicleType, activeRide],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useBooking() {
  const value = useContext(Context);
  if (!value) throw new Error("BookingProvider eksik");
  return value;
}
