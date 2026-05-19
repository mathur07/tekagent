import { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { ChatPanel } from "./components/ChatPanel";
import { Dashboard, type InteractRequest } from "./components/Dashboard";
import { RightPanel } from "./components/RightPanel";
import { SetupPage } from "./components/SetupPage";
import { useAgents, useSkills, useRepos, useCreateAgent, useDeleteAgent } from "./lib/queries";

function App() {
  const { data: agents = [] } = useAgents();
  const { data: skills = [] } = useSkills();
  const { data: repos } = useRepos();
  const createAgent = useCreateAgent();
  const deleteAgentMut = useDeleteAgent();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [showDashboard, setShowDashboard] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);

  useEffect(() => {
    if (repos && repos.length === 0 && agents.length === 0) {
      setShowSetup(true);
    }
  }, [repos]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setShowSetup((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSelectAgent = (name: string) => {
    setSelectedAgent(name);
    setShowDashboard(false);
    setShowSetup(false);
    setInitialPrompt(null);
  };

  const handleCreateAgent = async (name: string) => {
    const agent = await createAgent.mutateAsync(name);
    handleSelectAgent(agent.name);
  };

  const handleDeleteAgent = async (name: string) => {
    await deleteAgentMut.mutateAsync(name);
    if (selectedAgent === name) {
      setSelectedAgent(null);
      setShowDashboard(true);
    }
  };

  const handleInteract = async (req: InteractRequest) => {
    const res = await fetch("/api/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) return;

    const { agent_name } = await res.json();

    const prompt =
      req.type === "pr"
        ? `Review PR #${req.number} in ${req.repo}. Fetch the diff and provide a structured review with summary, issues, and verdict.`
        : `Analyze issue #${req.number} in ${req.repo}. Fetch the details, assess complexity, suggest an approach, and identify files to change.`;

    setInitialPrompt(prompt);
    setSelectedAgent(agent_name);
    setShowDashboard(false);
  };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%" }}>
      <Sidebar
        agents={agents}
        selectedAgent={showDashboard || showSetup ? null : selectedAgent}
        onSelectAgent={handleSelectAgent}
        onCreateAgent={handleCreateAgent}
        onDeleteAgent={handleDeleteAgent}
        onDashboard={() => { setShowDashboard(true); setShowSetup(false); }}
        showDashboard={showDashboard && !showSetup}
      />
      {showSetup ? (
        <SetupPage onClose={() => setShowSetup(false)} />
      ) : (
        <>
          <div style={{ flex: 1, display: showDashboard ? "flex" : "none", flexDirection: "column", minWidth: 0 }}>
            <Dashboard onInteract={handleInteract} />
          </div>
          {!showDashboard && (
            <ChatPanel
              key={selectedAgent || "none"}
              agentName={selectedAgent}
              initialPrompt={initialPrompt}
              onPromptConsumed={() => setInitialPrompt(null)}
            />
          )}
        </>
      )}
      <RightPanel skills={skills} onSetup={() => setShowSetup(true)} />
    </div>
  );
}

export default App;
