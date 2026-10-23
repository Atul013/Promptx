import importlib
from pathlib import Path
import sys
import types

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class FakeGameState:
    def __init__(self, session_id="PX-001"):
        self.session_id = session_id
        self.turn = 0
        self.stress = 0
        self.stress_state = "CALM"
        self.status = "ACTIVE"
        self.evidence_revealed = set()
        self.facts_established = set()
        self.milestones = {
            "timeline": False,
            "location": False,
            "contact": False,
            "motive": False,
            "final": False,
        }


async def fake_process_turn(question, state):
    state.turn += 1
    state.stress += 3
    return {
        "adrian_res": {"success": True, "answer": f"Answer to: {question}"},
        "delta": 3,
    }


@pytest.fixture(scope="module")
def server_module():
    fake_engine = types.ModuleType("py")
    fake_engine.GameState = FakeGameState
    fake_engine.process_turn = fake_process_turn
    sys.modules["py"] = fake_engine
    sys.modules.pop("server", None)
    return importlib.import_module("server")


@pytest.fixture()
def client(server_module):
    server_module.sessions = server_module.SessionStore()
    return TestClient(server_module.app)


def new_session(client):
    response = client.post("/api/session")
    assert response.status_code == 201
    return response.json()["session_id"]


def test_sessions_are_isolated_and_reset_independently(client):
    first = new_session(client)
    second = new_session(client)

    response = client.post(
        "/api/interrogate",
        headers={"X-Session-ID": first},
        json={"question": "Where were you?"},
    )
    assert response.status_code == 200
    assert response.json()["turn"] == 1

    untouched = client.get("/api/state", headers={"X-Session-ID": second})
    assert untouched.status_code == 200
    assert untouched.json()["turn"] == 0

    reset = client.post("/api/reset", headers={"X-Session-ID": first})
    assert reset.status_code == 200
    assert reset.json()["state"]["turn"] == 0
    assert client.get("/api/state", headers={"X-Session-ID": second}).json()["turn"] == 0


def test_question_and_session_validation(client, server_module):
    session_id = new_session(client)
    headers = {"X-Session-ID": session_id}

    assert client.post("/api/interrogate", json={"question": "hi"}).status_code == 422
    assert client.post(
        "/api/interrogate", headers=headers, json={"question": "   "}
    ).status_code == 400
    assert client.post(
        "/api/interrogate",
        headers=headers,
        json={"question": "x" * (server_module.MAX_QUESTION_LENGTH + 1)},
    ).status_code == 422
    assert client.get(
        "/api/state", headers={"X-Session-ID": "not-a-session"}
    ).status_code == 404


def test_question_limit_stops_before_processing_sixteenth_turn(client, server_module):
    session_id = new_session(client)
    headers = {"X-Session-ID": session_id}
    state = server_module.sessions.get(session_id)
    state.turn = server_module.MAX_TURNS - 1

    final_turn = client.post(
        "/api/interrogate", headers=headers, json={"question": "Final question"}
    )
    assert final_turn.status_code == 200
    assert final_turn.json()["turn"] == server_module.MAX_TURNS
    assert final_turn.json()["prompts_left"] == 0
    assert final_turn.json()["status"] == "TIMEOUT"

    exhausted_turn = client.post(
        "/api/interrogate", headers=headers, json={"question": "Extra question"}
    )
    assert exhausted_turn.status_code == 409
    assert exhausted_turn.json()["detail"] == (
        "Question limit reached. Reset the game to continue."
    )

    unchanged = client.get("/api/state", headers=headers).json()
    assert unchanged["turn"] == server_module.MAX_TURNS
    assert unchanged["prompts_left"] == 0
    assert unchanged["status"] == "TIMEOUT"


def test_session_store_expires_and_evicts_oldest(server_module):
    now = [0.0]
    store = server_module.SessionStore(
        max_sessions=2, ttl_seconds=10, clock=lambda: now[0]
    )
    first = store.create()
    second = store.create()
    third = store.create()

    assert len(store) == 2
    with pytest.raises(KeyError):
        store.get(first)
    assert store.get(second).session_id == second
    assert store.get(third).session_id == third

    now[0] = 11.0
    assert len(store) == 0
    with pytest.raises(KeyError):
        store.get(second)
