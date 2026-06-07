import { useEffect } from "react";
import "../styles/TitleStyle.css";

type TitleScreenProps = {
  onStart: () => void;
};

function TitleScreen({ onStart }: TitleScreenProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter") {
        onStart();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onStart]);

  return (
    <div
      className="title-screen"
      role="button"
      tabIndex={0}
      onClick={onStart}
    >
      <div className="title-top-half">
        <img
          className="title-logo"
          src="/images/PassTheAux.png"
          alt="PassTheAux"
        />
      </div>

      <div className="title-bottom-half">
        <p className="press-enter-text">Press enter or tap to continue</p>
      </div>
    </div>
  );
}

export default TitleScreen;
