import { useEffect } from "react";
import "../styles/MenuStyle.css";

type MenuScreenProps = {
  onHost: () => void;
  onJoin: () => void;
  onHowToPlay: () => void;
  onBackToTitle: () => void;
};

function MenuScreen({
  onHost,
  onJoin,
  onHowToPlay,
  onBackToTitle,
}: MenuScreenProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onBackToTitle();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onBackToTitle]);

  return (
    <div className="menu-screen">
      <div className="menu-button-column">
        <button className="image-menu-button" onClick={onHost}>
          <img src="/images/Host.png" alt="Host" />
        </button>

        <button className="image-menu-button join-button" onClick={onJoin}>
          <img src="/images/Join.png" alt="Join" />
        </button>

        <button className="image-menu-button" onClick={onHowToPlay}>
          <img src="/images/HowToPlay.png" alt="How to Play" />
        </button>
      </div>
    </div>
  );
}

export default MenuScreen;