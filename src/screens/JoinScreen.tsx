import { useState } from "react";
import "../styles/JoinStyle.css";

type JoinScreenProps = {
  onJoinLobby: (lobbyCode: string) => void;
  onBack: () => void;
};

function JoinScreen({ onJoinLobby, onBack }: JoinScreenProps) {
  const [lobbyCode, setLobbyCode] = useState("");

  function handleCodeChange(value: string) {
    const cleanValue = value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);

    setLobbyCode(cleanValue);
  }

  function handleJoinClick() {
    if (lobbyCode.length !== 6) {
      return;
    }

    onJoinLobby(lobbyCode);
  }

  return (
    <div className="join-screen">
      <div className="join-content">
        <div className="join-inner">
            <div className="lobby-code-row">
                <p className="lobby-code-label">Lobby Code:</p>

                <div
                className="code-boxes"
                onClick={() => document.getElementById("lobby-code-input")?.focus()}
                >
                {[0, 1, 2, 3, 4, 5].map((index) => (
                    <div className="code-box" key={index}>
                    {lobbyCode[index] || ""}
                    </div>
                ))}
                </div>

                <input
                id="lobby-code-input"
                className="hidden-code-input"
                value={lobbyCode}
                maxLength={6}
                onChange={(event) => handleCodeChange(event.target.value)}
                autoFocus
                />
            </div>

            <div className="join-buttons-row">
                <button
                className="join-submit-button"
                onClick={handleJoinClick}
                disabled={lobbyCode.length !== 6}
                >
                <img src="/images/Join.png" alt="Join" />
                </button>

                <button className="join-back-button" onClick={onBack}>
                <img src="/images/Back.png" alt="Back" />
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}

export default JoinScreen;