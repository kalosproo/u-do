import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SPEECH_RECOGNITION_SUPPORTED, parseAssistantCommand } from "../utils/assistantCommands";

function AppAssistant() {
  const [commandText, setCommandText] = useState("");
  const [status, setStatus] = useState("Ask me: 'add task submit report tomorrow'");
  const navigate = useNavigate();
  const location = useLocation();

  const runCommand = (rawInput) => {
    const command = parseAssistantCommand(rawInput);

    if (command.type === "unknown") {
      setStatus("Sorry, I could not understand. Try: go to finance / add task / add habit.");
      return;
    }

    if (command.targetRoute && location.pathname !== command.targetRoute) {
      navigate(command.targetRoute);
    }

    if (command.type === "navigation") {
      setStatus(`Opened ${command.targetRoute}.`);
      return;
    }

    window.dispatchEvent(new CustomEvent(command.event, { detail: command.payload }));
    setStatus(`Done: ${rawInput}`);
  };

  const handleVoice = () => {
    if (!SPEECH_RECOGNITION_SUPPORTED) {
      setStatus("Voice input is not supported in this browser.");
      return;
    }

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionClass();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setStatus("Listening...");
    recognition.onerror = () => setStatus("Voice capture failed. Please try again.");
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      setCommandText(transcript);
      runCommand(transcript);
    };

    recognition.start();
  };

  return (
    <div className="app-assistant">
      <p className="assistant-title">U-Do Assistant</p>
      <div className="assistant-controls">
        <input
          value={commandText}
          onChange={(event) => setCommandText(event.target.value)}
          placeholder="Type command..."
        />
        <button type="button" onClick={() => runCommand(commandText)}>
          Run
        </button>
        <button type="button" onClick={handleVoice}>🎤</button>
      </div>
      <small>{status}</small>
    </div>
  );
}

export default AppAssistant;
