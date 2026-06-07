import { useState } from "react";
import "../styles/ModeSelectionStyle.css";

type ModeSelectionScreenProps = {
  onBack: () => void;
  onContinue: (rounds: number) => void;
};

function ModeSelectionScreen({ onBack, onContinue }: ModeSelectionScreenProps) {
  const [selectedRounds, setSelectedRounds] = useState(1);

  return (
    <div className="mode-selection-screen">
      <div className="mode-selection-wrapper">
        <div className="mode-card classic-card">
          <div className="mode-card-inner">
            <div className="mode-row mode-title-row">
              <img
                className="classic-title-image"
                src="/images/Classic.png"
                alt="Classic"
              />
            </div>

            <div className="mode-row mode-description-row">
              <p className="mode-description">
                Can you match a song to a vibe?
              </p>
            </div>

            <div className="mode-row mode-subheading-row">
              <h2 className="rounds-heading">Rounds</h2>
            </div>

            <div className="mode-row rounds-row">
              {[1, 2, 3].map((round) => (
                <button
                  key={round}
                  className={
                    selectedRounds === round
                      ? "round-button selected-round"
                      : "round-button"
                  }
                  onClick={() => setSelectedRounds(round)}
                >
                  {round}
                </button>
              ))}
            </div>

            <div className="mode-row create-lobby-row">
              <button
                className="create-lobby-button"
                onClick={() => onContinue(selectedRounds)}
              >
                <img src="/images/CreateLobby.png" alt="Create Lobby" />
              </button>
            </div>
          </div>
        </div>

        <div className="mode-card coming-soon-card">
          <div className="mode-card-inner coming-soon-inner">
            <p className="coming-soon-text">More Gamemodes coming soon!</p>

            <button className="mode-back-button" onClick={onBack}>
              <img src="/images/Back.png" alt="Back" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ModeSelectionScreen;
