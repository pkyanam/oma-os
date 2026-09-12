"use client";
import { useEffect, useState, useRef } from "react";
import { useLoginWithChatGPT } from "@opencoredev/loginwithchatgpt-react";
import { Check, RefreshCw, ExternalLink, X } from "lucide-react";
import {
  useAgentConfig,
  providerURL,
  selectAgentMode,
  selectAgentModel,
} from "@/lib/agent/settings";
import { WORKERS_AI_MODEL, workersAIAvailability } from "@/lib/agent/hosted";
import { discoverModels } from "@/lib/agent/harness";
export default function AgentSettings({ onClose }: { onClose: () => void }) {
  const config = useAgentConfig(),
    [models, setModels] = useState<string[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [hosted, setHosted] = useState<{ enabled: boolean; models: string[] }>(),
    [availability, setAvailability] = useState<{
      enabled: boolean;
      reason?: string;
    }>();
  const discoveryRequest = useRef(0);
  useEffect(() => {
    const unsubscribe = useAgentConfig.subscribe((next, previous) => {
      if (
        next.mode !== previous.mode ||
        next.baseURL !== previous.baseURL ||
        next.apiKey !== previous.apiKey ||
        next.authenticated !== previous.authenticated
      ) {
        discoveryRequest.current++;
        setLoading(false);
        setModels([]);
      }
    });
    return () => {
      discoveryRequest.current++;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    void fetch("/api/agent-config")
      .then((r) => r.json())
      .then((data) => {
        setAvailability(data.chatgpt);
        setHosted(workersAIAvailability(data.workersAI));
      })
      .catch(() => {
        setAvailability({
          enabled: false,
          reason: "Auth service unavailable. Direct provider keys still work.",
        });
        setHosted({ enabled: false, models: [] });
      });
  }, []);
  useEffect(() => {
    if (
      config.mode === "workers-ai" &&
      hosted?.enabled &&
      !hosted.models.includes(config.model)
    )
      selectAgentModel(hosted.models[0]);
  }, [config.mode, config.model, hosted]);
  const refresh = async () => {
    const requested = useAgentConfig.getState();
    const requestId = ++discoveryRequest.current;
    const currentRequest = () => {
      const current = useAgentConfig.getState();
      return (
        requestId === discoveryRequest.current &&
        current.mode === requested.mode &&
        current.authenticated === requested.authenticated &&
        (requested.mode !== "direct" ||
          (current.baseURL === requested.baseURL &&
            current.apiKey === requested.apiKey))
      );
    };
    setLoading(true);
    setError("");
    try {
      const ids = await discoverModels(requested);
      if (!currentRequest()) return;
      setModels(ids);
      if (!ids.length)
        throw new Error(
          "No models returned. Enter a model ID supported by this provider.",
        );
      if (!useAgentConfig.getState().model) selectAgentModel(ids[0]);
    } catch (e) {
      if (currentRequest())
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (currentRequest()) setLoading(false);
    }
  };
  return (
    <div className="agent-settings">
      <div className="agent-settings-title">
        <span>Model & connection</span>
        <button aria-label="Close agent settings" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="connection-tabs">
        <button
          className={config.mode === "chatgpt" ? "selected" : ""}
          onClick={() => {
            selectAgentMode("chatgpt");
            setModels([]);
            setError("");
          }}
        >
          ChatGPT account
        </button>
        <button
          className={config.mode === "direct" ? "selected" : ""}
          onClick={() => {
            selectAgentMode("direct");
            setModels([]);
            setError("");
          }}
        >
          Provider key
        </button>
        <button
          className={config.mode === "workers-ai" ? "selected" : ""}
          onClick={() => {
            selectAgentMode("workers-ai", WORKERS_AI_MODEL);
            setModels([]);
            setError("");
          }}
        >
          Workers AI
        </button>
      </div>
      {config.mode === "workers-ai" ? (
        <>
          <p className="connection-note">
            Run on Cloudflare with no sign-in or provider key. Choose a model
            below. Daily limits apply per network and across this deployment;
            your selected model receives the conversation and tool results.
          </p>
          {!hosted?.enabled && (
            <p className="connection-note">
              {hosted
                ? "Workers AI is not enabled on this deployment."
                : "Checking Workers AI availability…"}
            </p>
          )}
        </>
      ) : config.mode === "chatgpt" ? (
        availability?.enabled ? (
          <ChatGPTConnection onConnected={() => void refresh()} />
        ) : (
          <p className="connection-note">
            {availability?.reason ?? "Checking authentication service…"}
          </p>
        )
      ) : (
        <>
          <label>
            OpenAI-compatible base URL
            <input
              aria-label="Provider base URL"
              value={config.baseURL}
              spellCheck={false}
              placeholder="https://openrouter.ai/api/v1"
              onChange={(e) =>
                useAgentConfig.setState({ baseURL: e.target.value, model: "" })
              }
            />
          </label>
          <label>
            API key
            <input
              aria-label="Provider API key"
              type="password"
              autoComplete="off"
              value={config.apiKey}
              onChange={(e) =>
                useAgentConfig.setState({ apiKey: e.target.value })
              }
            />
          </label>
          <p className="connection-note">
            The key stays in this tab’s memory. Requests go directly to your
            provider, which must allow browser CORS. No key is stored on the
            oma.os server.
          </p>
        </>
      )}
      <label>
        Model
        <div className="model-field">
          {config.mode === "workers-ai" ? (
            <select
              aria-label="Model ID"
              value={config.model}
              disabled={!hosted?.enabled}
              onChange={(e) => selectAgentModel(e.target.value)}
            >
              {!hosted?.enabled && (
                <option value={config.model}>Workers AI unavailable</option>
              )}
              {hosted?.models.map((model) => (
                <option key={model} value={model}>
                  {model.replace("@cf/", "")}
                </option>
              ))}
            </select>
          ) : (
            <input
              aria-label="Model ID"
              list="oma-models"
              value={config.model}
              placeholder="Refresh models or enter a model ID"
              onChange={(e) => selectAgentModel(e.target.value)}
            />
          )}
          {config.mode !== "workers-ai" && (
            <button
              aria-label="Refresh models"
              title="Refresh available models"
              disabled={
                loading || (config.mode === "chatgpt" && !config.authenticated)
              }
              onClick={() => void refresh()}
            >
              <RefreshCw size={14} className={loading ? "spinning" : ""} />
            </button>
          )}
        </div>
        <datalist id="oma-models">
          {models.map((m) => (
            <option value={m} key={m} />
          ))}
        </datalist>
      </label>
      <label className="agent-tools-option">
        <input
          type="checkbox"
          checked={config.tools}
          onChange={(e) => useAgentConfig.setState({ tools: e.target.checked })}
        />
        <span>Allow local file and desktop tools</span>
      </label>
      <p className="connection-note">
        File contents read by tools are sent to your selected model. Replacing
        an existing file asks for approval.
      </p>
      {error && (
        <div className="agent-error" role="alert">
          {error}
        </div>
      )}
      <div className="agent-settings-bottom">
        <span>AI SDK ToolLoopAgent · 12 steps / turn</span>
        <button
          onClick={() => {
            try {
              if (config.mode === "direct") providerURL(config.baseURL);
              if (!config.model) throw new Error("Choose a model first.");
              if (config.mode === "workers-ai" && !hosted?.enabled)
                throw new Error(
                  "Workers AI is unavailable on this deployment. Choose another connection explicitly.",
                );
              if (config.mode === "chatgpt" && !config.authenticated)
                throw new Error("Sign in to ChatGPT to use this connection.");
              if (config.mode === "direct" && !config.apiKey)
                throw new Error(
                  "Enter your provider API key. Keys must be entered again after a reload.",
                );
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          <Check size={13} />
          Done
        </button>
      </div>
    </div>
  );
}
function ChatGPTConnection({ onConnected }: { onConnected: () => void }) {
  const auth = useLoginWithChatGPT();
  const connectedCallback = useRef(onConnected);
  connectedCallback.current = onConnected;
  useEffect(() => {
    if (auth.status === "loading") return;
    useAgentConfig.setState({ authenticated: auth.isAuthenticated });
    if (auth.isAuthenticated) connectedCallback.current();
  }, [auth.isAuthenticated, auth.status]);
  return (
    <div className="chatgpt-connection">
      {auth.isAuthenticated ? (
        <>
          <div className="connected-account">
            <Check size={14} />
            <span>{auth.user?.email ?? "ChatGPT connected"}</span>
            <button onClick={() => void auth.logout()}>Disconnect</button>
          </div>
        </>
      ) : auth.isPending ? (
        <>
          <p>Enter this code on OpenAI’s verification page:</p>
          <div className="device-code">
            {auth.userCode}
            <button onClick={() => void auth.copyCode()}>
              {auth.copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button className="connect-button" onClick={() => auth.reopen()}>
            Open verification page <ExternalLink size={12} />
          </button>
          <p className="connection-note">
            Waiting for you to authorize. {auth.status}
          </p>
        </>
      ) : (
        <>
          <p className="connection-note">
            Requests use your ChatGPT plan. Prompts pass through this app’s
            bundled auth service. The sign-in service stores encrypted session
            credentials and never sees your password. Disconnect deletes the
            stored session. This community SDK is not an official OpenAI sign-in
            integration.
          </p>
          <button
            className="connect-button"
            disabled={auth.isConnecting || auth.status === "loading"}
            onClick={() => void auth.login()}
          >
            {auth.isConnecting
              ? "Connecting…"
              : "I trust this app — continue with ChatGPT"}
          </button>
        </>
      )}
      {auth.error && (
        <div className="agent-error" role="alert">
          {auth.error}
        </div>
      )}
    </div>
  );
}
