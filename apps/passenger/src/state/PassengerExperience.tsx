import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type PropsWithChildren,
} from "react";

export interface Address {
  id: string;
  label: string;
  address: string;
  type: "home" | "work" | "favorite";
}

type Action =
  | { type: "remove-address"; id: string }
  | { type: "save-address"; address: Address }
  | { type: "hydrate-addresses"; addresses: Address[] };

const STORAGE_KEY = "heytaksi.passenger.addresses.v2";
const defaultAddresses: Address[] = [
  { id: "home", label: "Ev", address: "Dereboyu, Mehmet Akif Caddesi, Lefkoşa, KKTC", type: "home" },
  { id: "work", label: "İş", address: "Yakın Doğu Üniversitesi, Lefkoşa, KKTC", type: "work" },
  { id: "fav-1", label: "Girne Limanı", address: "Girne Limanı, Girne, KKTC", type: "favorite" },
];

function loadAddresses(): Address[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultAddresses;
    const parsed = JSON.parse(raw) as Address[];
    return Array.isArray(parsed) && parsed.length ? parsed : defaultAddresses;
  } catch {
    return defaultAddresses;
  }
}

function persist(addresses: Address[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses));
}

function reducer(state: Address[], action: Action): Address[] {
  if (action.type === "hydrate-addresses") return action.addresses;
  if (action.type === "remove-address") {
    const next = state.filter((item) => item.id !== action.id);
    persist(next);
    return next;
  }
  if (action.type === "save-address") {
    const next =
      action.address.type === "favorite"
        ? [...state.filter((item) => item.id !== action.address.id), action.address]
        : [...state.filter((item) => item.type !== action.address.type), action.address];
    persist(next);
    return next;
  }
  return state;
}

const PassengerContext = createContext<{
  addresses: Address[];
  dispatch: Dispatch<Action>;
} | null>(null);

export function PassengerExperienceProvider({ children }: PropsWithChildren) {
  const [addresses, dispatch] = useReducer(reducer, defaultAddresses);
  useEffect(() => {
    dispatch({ type: "hydrate-addresses", addresses: loadAddresses() });
  }, []);
  const value = useMemo(() => ({ addresses, dispatch }), [addresses]);
  return <PassengerContext.Provider value={value}>{children}</PassengerContext.Provider>;
}

export function usePassengerExperience() {
  const value = useContext(PassengerContext);
  if (!value) throw new Error("PassengerExperienceProvider eksik.");
  return value;
}
