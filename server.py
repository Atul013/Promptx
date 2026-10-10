import os
import secrets
import sys
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Callable

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Import py module functions and GameState
try:
    from py import GameState, process_turn
except ImportError:
    # If imported from another path
    sys.path.append(os.path.dirname(__file__))
    from py import GameState, process_turn

MAX_QUESTION_LENGTH = 500
MAX_SESSIONS = 100
SESSION_TTL_SECONDS = 60 * 60 * 4


@dataclass
class SessionEntry:
    state: GameState
    touched_at: float


class SessionStore:
    """Small sliding-TTL session store for the local demo.

    The cap prevents abandoned browser tabs from growing memory without bound.
    This is intentionally in-memory: restarting the local server resets games.
    """

    def __init__(
        self,
        max_sessions: int = MAX_SESSIONS,
        ttl_seconds: int = SESSION_TTL_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ):
        if max_sessions < 1 or ttl_seconds < 1:
            raise ValueError("Session limits must be positive.")
        self.max_sessions = max_sessions
        self.ttl_seconds = ttl_seconds
        self.clock = clock
        self._entries: OrderedDict[str, SessionEntry] = OrderedDict()

    def _purge_expired(self, now: float) -> None:
        expired = [
            session_id
            for session_id, entry in self._entries.items()
            if now - entry.touched_at >= self.ttl_seconds
        ]
        for session_id in expired:
            self._entries.pop(session_id, None)

    def create(self) -> str:
        now = self.clock()
        self._purge_expired(now)
        while len(self._entries) >= self.max_sessions:
            self._entries.popitem(last=False)

        session_id = secrets.token_urlsafe(24)
        self._entries[session_id] = SessionEntry(
            state=GameState(session_id), touched_at=now
        )
        return session_id

    def get(self, session_id: str) -> GameState:
        now = self.clock()
        self._purge_expired(now)
        entry = self._entries.get(session_id)
        if entry is None:
            raise KeyError(session_id)
        entry.touched_at = now
        self._entries.move_to_end(session_id)
        return entry.state

    def reset(self, session_id: str) -> GameState:
        self.get(session_id)
        entry = self._entries[session_id]
        entry.state = GameState(session_id)
        return entry.state

    def __len__(self) -> int:
        self._purge_expired(self.clock())
        return len(self._entries)


app = FastAPI(title="Prompt-X Interrogation API")

# The browser client is local-only. Wildcard origins and credentialed CORS must
# not be combined, so list the two development origins explicitly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://127.0.0.1:8080"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Session-ID"],
)

sessions = SessionStore()


class QuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=MAX_QUESTION_LENGTH)


def _get_state(session_id: str) -> GameState:
    try:
        return sessions.get(session_id)
    except KeyError as exc:
        raise HTTPException(
            status_code=404, detail="Session not found or expired. Start a new game."
        ) from exc


def _state_payload(game_state: GameState) -> dict:
    return {
        "session_id": game_state.session_id,
        "turn": game_state.turn,
        "stress": game_state.stress,
        "stress_state": game_state.stress_state,
        "status": game_state.status,
        "evidence_revealed": list(game_state.evidence_revealed),
        "facts_established": list(game_state.facts_established),
        "milestones": game_state.milestones,
        "prompts_left": max(0, 15 - game_state.turn),
    }


@app.get("/")
def read_root():
    return {"status": "ok", "message": "Prompt-X Interrogation API running"}


@app.post("/api/session", status_code=201)
def create_session():
    session_id = sessions.create()
    return _state_payload(_get_state(session_id))


@app.get("/api/state")
def get_state(x_session_id: str = Header(alias="X-Session-ID")):
    return _state_payload(_get_state(x_session_id))


@app.post("/api/interrogate")
async def interrogate(
    req: QuestionRequest, x_session_id: str = Header(alias="X-Session-ID")
):
    game_state = _get_state(x_session_id)
    question = req.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    if game_state.status == "CONFESSION":
        return {
            "response": "Adrian has already confessed! Case solved.",
            **_state_payload(game_state),
            "confession": True,
        }

    turn_result = await process_turn(question, game_state)
    res = turn_result["adrian_res"]

    response_text = (
        res["answer"]
        if res["success"]
        else "Adrian could not answer. Please try another question."
    )

    return {
        "response": response_text,
        **_state_payload(game_state),
        "delta": turn_result.get("delta", 0),
        "confession": game_state.status == "CONFESSION",
    }


@app.post("/api/reset")
def reset_game(x_session_id: str = Header(alias="X-Session-ID")):
    game_state = sessions.reset(x_session_id)
    return {
        "message": "Game state reset successfully",
        "state": _state_payload(game_state),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
