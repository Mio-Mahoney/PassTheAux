type ModeSelectionScreenProps = {
  onBack: () => void;
  onContinue: () => void;
};

function ModeSelectionScreen({ onBack, onContinue }: ModeSelectionScreenProps) {
  return (
    <div className="screen mode-selection-screen">
      <h1 className="screen-title">Select Mode</h1>

      <div className="menu-buttons">
        <button className="menu-button" onClick={onContinue}>
          Classic Mode
        </button>

        <button className="menu-button" onClick={onContinue}>
          Vibe Battle
        </button>

        <button className="menu-button" onClick={onContinue}>
          Freestyle
        </button>
      </div>

      <button className="back-button" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

export default ModeSelectionScreen;