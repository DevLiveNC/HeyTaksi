import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type PropsWithChildren,
} from "react";

export type RideStatus = "completed" | "cancelled" | "upcoming";
export interface Address {
  id: string;
  label: string;
  address: string;
  type: "home" | "work" | "favorite";
}
export interface RideSummary {
  id: string;
  date: string;
  time: string;
  from: string;
  to: string;
  driver: string;
  vehicle: string;
  plate: string;
  fare: number;
  status: RideStatus;
}
export interface NearbyTaxi {
  id: string;
  x: number;
  y: number;
  rotation: number;
  eta: number;
}
export interface PassengerNotification {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
}
interface State {
  currentLocation: string;
  addresses: Address[];
  rides: RideSummary[];
  nearbyTaxis: NearbyTaxi[];
  notifications: PassengerNotification[];
  walletBalance: number;
  selectedRideFilter: "all" | RideStatus;
}
type Action =
  | { type: "mark-notifications-read" }
  | { type: "set-ride-filter"; value: State["selectedRideFilter"] }
  | { type: "remove-address"; id: string }
  | { type: "save-address"; address: Address };

const initialState: State = {
  currentLocation: "Yenişehir, Mersin",
  addresses: [
    {
      id: "home",
      label: "Ev",
      address: "50. Yıl Mah., Yenişehir",
      type: "home",
    },
    {
      id: "work",
      label: "İş",
      address: "Çiftlikköy, Üniversite Cd.",
      type: "work",
    },
    {
      id: "fav-1",
      label: "Marina",
      address: "Adnan Menderes Bulvarı",
      type: "favorite",
    },
  ],
  rides: [
    {
      id: "ride-1",
      date: "21 Ağustos 2026",
      time: "18:42",
      from: "Mersin Marina",
      to: "Forum Mersin",
      driver: "Ahmet Yılmaz",
      vehicle: "Toyota Corolla · Beyaz",
      plate: "33 T 0421",
      fare: 184.5,
      status: "completed",
    },
    {
      id: "ride-2",
      date: "18 Ağustos 2026",
      time: "09:15",
      from: "50. Yıl Mahallesi",
      to: "Mersin Garı",
      driver: "Selin Kaya",
      vehicle: "Renault Megane · Gri",
      plate: "33 T 1188",
      fare: 236,
      status: "completed",
    },
    {
      id: "ride-3",
      date: "12 Ağustos 2026",
      time: "22:08",
      from: "Pozcu",
      to: "Mezitli",
      driver: "Murat Demir",
      vehicle: "Fiat Egea · Sarı",
      plate: "33 T 0907",
      fare: 198.75,
      status: "cancelled",
    },
  ],
  nearbyTaxis: [
    { id: "taxi-1", x: 22, y: 34, rotation: 12, eta: 2 },
    { id: "taxi-2", x: 72, y: 22, rotation: 96, eta: 4 },
    { id: "taxi-3", x: 65, y: 68, rotation: -32, eta: 3 },
    { id: "taxi-4", x: 30, y: 76, rotation: 158, eta: 5 },
  ],
  notifications: [
    {
      id: "n1",
      title: "Hoş geldin",
      body: "Hey Taksi hesabın güvenle hazırlandı.",
      time: "Şimdi",
      read: false,
    },
    {
      id: "n2",
      title: "Güvenlik kontrolü",
      body: "Yeni cihaz oturumun doğrulandı.",
      time: "2 saat önce",
      read: false,
    },
    {
      id: "n3",
      title: "Yolculuk özeti",
      body: "Son yolculuğunun detayları hazır.",
      time: "2 gün önce",
      read: true,
    },
  ],
  walletBalance: 420.5,
  selectedRideFilter: "all",
};
function reducer(state: State, action: Action): State {
  if (action.type === "mark-notifications-read")
    return {
      ...state,
      notifications: state.notifications.map((item) => ({
        ...item,
        read: true,
      })),
    };
  if (action.type === "set-ride-filter")
    return { ...state, selectedRideFilter: action.value };
  if (action.type === "remove-address")
    return {
      ...state,
      addresses: state.addresses.filter((item) => item.id !== action.id),
    };
  if (action.type === "save-address")
    return {
      ...state,
      addresses: [
        ...state.addresses.filter((item) => item.type !== action.address.type),
        action.address,
      ],
    };
  return state;
}
const PassengerContext = createContext<{
  state: State;
  dispatch: Dispatch<Action>;
} | null>(null);
export function PassengerExperienceProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return (
    <PassengerContext.Provider value={value}>
      {children}
    </PassengerContext.Provider>
  );
}
export function usePassengerExperience() {
  const value = useContext(PassengerContext);
  if (!value) throw new Error("PassengerExperienceProvider eksik.");
  return value;
}
