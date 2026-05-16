"""
Hermes Plugin for UniPet Desktop Pet

Config: ~/.hermes/plugins/unipet/
Activate: hermes plugins enable unipet

Hermes invokes this plugin on lifecycle events.
Each handler POSTs the event to the UniPet HTTP server.
"""

import json
import os
import urllib.request

SERVER_PORT = 23333

EVENT_TO_STATE = {
    "SessionStart": "thinking",
    "UserPromptSubmit": "thinking",
    "PreToolUse": "working",
    "PostToolUse": "working",
    "PostToolUseFailure": "error",
    "Stop": "attention",
    "StopFailure": "error",
    "SessionEnd": "idle",
}


def _post_state(state, event_name=""):
    try:
        data = json.dumps({
            "state": state,
            "source": "hermes",
            "sessionId": "hermes",
            "meta": {"eventName": event_name},
        }).encode()
        req = urllib.request.Request(
            f"http://127.0.0.1:{SERVER_PORT}/api/state",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=2)
    except Exception:
        pass  # UniPet not running — exit silently


def on_session_start(event):
    _post_state("thinking", "SessionStart")


def on_user_prompt_submit(event):
    _post_state("thinking", "UserPromptSubmit")


def on_pre_tool_use(event):
    tool = (event.get("tool_name") or "").lower()
    if "edit" in tool or "write" in tool:
        _post_state("editing", "PreToolUse")
    elif "bash" in tool or "terminal" in tool:
        _post_state("working", "PreToolUse")
    else:
        _post_state("working", "PreToolUse")


def on_post_tool_use(event):
    _post_state("working", "PostToolUse")


def on_stop(event):
    _post_state("attention", "Stop")


def on_error(event):
    _post_state("error", "PostToolUseFailure")


def on_session_end(event):
    _post_state("idle", "SessionEnd")
