import "../styles/HotseatWaitingStyle.css";

type HotseatWaitingScreenProps = {
  hotseatName: string;
  isHotseatPlayer: boolean;
  onBack: () => void;
};

function HotseatWaitingScreen({
  hotseatName,
  isHotseatPlayer,
  onBack,
}: HotseatWaitingScreenProps) {
  return (
    <div className="hotseat-waiting-screen">
      <div className="hotseat-waiting-content">
        <button
          className="hotseat-waiting-back"
          type="button"
          onClick={onBack}
          aria-label="Back"
        >
          Back
        </button>

        <p className="hotseat-waiting-kicker">Hotseat</p>
        <h1 className="hotseat-waiting-title">
          {hotseatName} is in the hotseat currently
        </h1>
        <p className="hotseat-waiting-subtitle">
          {isHotseatPlayer
            ? "Pick the prompt and starting song."
            : "Waiting for the prompt and starting song."}
        </p>
      </div>
    </div>
  );
}

export default HotseatWaitingScreen;
