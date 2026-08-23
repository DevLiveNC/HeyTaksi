import { LocateFixed, Navigation } from "lucide-react";
import { usePassengerExperience } from "../../state/PassengerExperience";

export function MapCanvas() {
  const { state } = usePassengerExperience();
  return (
    <section
      className="map-card"
      aria-label="Yakındaki taksilerin temsili haritası"
    >
      <svg
        className="map-lines"
        viewBox="0 0 400 280"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M-20 55 C80 105 120 10 220 58 S330 120 430 65" />
        <path d="M50-20 C90 60 50 120 140 165 S250 210 260 310" />
        <path d="M-10 220 C100 175 170 255 250 205 S350 140 420 180" />
        <path
          className="minor"
          d="M180-10 L130 300M330-10 C270 80 355 170 320 300M-20 130 L430 120"
        />
      </svg>
      <span className="map-water" aria-hidden="true">
        AKDENİZ
      </span>
      <span className="map-park park-one" />
      <span className="map-park park-two" />
      {state.nearbyTaxis.map((taxi) => (
        <button
          className="taxi-marker"
          key={taxi.id}
          style={{
            left: `${taxi.x}%`,
            top: `${taxi.y}%`,
            transform: `rotate(${taxi.rotation}deg)`,
          }}
          aria-label={`${taxi.eta} dakika uzaklıkta taksi`}
        >
          <span>▰</span>
        </button>
      ))}
      <div className="user-location" aria-label="Mevcut konum">
        <span />
        <i />
      </div>
      <button className="locate-button" aria-label="Konumuma dön">
        <LocateFixed size={19} />
      </button>
      <div className="map-status">
        <Navigation size={13} />
        <span>
          <strong>{state.nearbyTaxis.length} taksi</strong> yakınında
        </span>
      </div>
    </section>
  );
}
