import { useState } from "react";
import { askAI } from "../services/aiAssistant";

function AIAssistant() {

  const [question,setQuestion] = useState("");
  const [answer,setAnswer] = useState("");

  const handleAsk = async () => {
    const response = await askAI(question);
    setAnswer(response);
  };

  return (
    <div className="ai-panel">

      <h3>U.Do AI Assistant</h3>

      <input
        placeholder="Ask productivity advice..."
        value={question}
        onChange={(e)=>setQuestion(e.target.value)}
      />

      <button onClick={handleAsk}>
        Ask AI
      </button>

      <p>{answer}</p>

    </div>
  );
}

export default AIAssistant;