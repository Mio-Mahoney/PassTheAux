type LobbyScreenProps = {
  onBack: () => void;
};

function LobbyScreen({ onBack }: LobbyScreenProps) {
  return (
    <div className="screen lobby-screen">
      <h1 className="screen-title">Lobby</h1>

      <p className="small-text">Waiting for players...</p>

      <button className="back-button" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

export default LobbyScreen;