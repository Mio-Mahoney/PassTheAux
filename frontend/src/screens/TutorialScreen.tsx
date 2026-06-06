import "../styles/TutorialStyle.css";

type TutorialScreenProps = {
  onBack: () => void;
};

function TutorialScreen({ onBack }: TutorialScreenProps) {
  return (
    <div className="tutorial-screen">
      <div className="tutorial-content">
        <div className="tutorial-inner">
          <h1 className="tutorial-title">How to Play</h1>

          <div className="tutorial-box">
            <p>PassTheAux is a music party game.</p>
            <p>Players choose songs that best match the given vibe or prompt.</p>
            <p>The host controls the round, and everyone votes for the best song.</p>
            <p>The player with the best song choice wins the round.</p>
          </div>

          <button className="tutorial-back-button" onClick={onBack}>
            <img src="/images/Back.png" alt="Back" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default TutorialScreen;