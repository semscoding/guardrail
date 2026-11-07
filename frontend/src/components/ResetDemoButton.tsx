"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

const TOKEN_KEY = "guardrail-admin-token";

const readToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
};

type State = "idle" | "confirm" | "token" | "working" | "done" | "error";

/** Back to a clean demo between video takes. Two steps, so a stray click never wipes a run. */
export function ResetDemoButton() {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");

  async function reset(withToken = readToken()) {
    setState("working");
    const res = await fetch("/api/demo/reset", {
      method: "POST",
      headers: withToken ? { "x-admin-token": withToken } : {},
    }).catch(() => null);
    if (res?.status === 401) {
      setState("token");
      setMessage(withToken ? "That admin token was not accepted." : "");
      return;
    }
    if (!res?.ok) {
      setState("error");
      setMessage("The reset failed. Check the server log.");
      return;
    }
    try {
      if (withToken) sessionStorage.setItem(TOKEN_KEY, withToken);
    } catch {
      // Private mode: the token is simply asked again next time.
    }
    setState("done");
    setMessage("Demo reset. Runs, invoices and disputes are back to the start.");
    router.refresh();
    setTimeout(() => setState("idle"), 4000);
  }

  function submitToken(e: FormEvent) {
    e.preventDefault();
    void reset(token.trim());
  }

  return (
    <div className="flex items-center gap-2">
      {state === "confirm" ? (
        <>
          <Button size="sm" variant="destructive" onClick={() => void reset()}>
            Reset all demo data
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setState("idle")}>
            Cancel
          </Button>
        </>
      ) : state === "token" ? (
        <form onSubmit={submitToken} className="flex items-center gap-2">
          <label className="sr-only" htmlFor="admin-token">
            Admin token
          </label>
          <input
            id="admin-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Admin token"
            className="gr-field h-8 w-36 px-2 text-sm"
          />
          <Button size="sm" type="submit" disabled={!token.trim()}>
            Reset
          </Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setState("idle")}>
            Cancel
          </Button>
        </form>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={state === "working"}
          onClick={() => setState("confirm")}
          aria-label={state === "working" ? "Resetting demo" : "Reset demo"}
        >
          <RotateCcw aria-hidden="true" />
          {/* Icon only on narrow headers; the aria-label keeps the name. */}
          <span className="hidden lg:inline">{state === "working" ? "Resetting…" : "Reset demo"}</span>
        </Button>
      )}
      <span role="status" className={state === "error" || state === "token" ? "text-xs text-block" : "sr-only"}>
        {state === "done" || state === "error" || state === "token" ? message : ""}
      </span>
    </div>
  );
}
