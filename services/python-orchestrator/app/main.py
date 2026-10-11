"""Shadow-only internal orchestration contract.

This service deliberately owns no browser session, room, queue, or WebSocket
state. Node remains the source of truth while responses are compared in shadow
mode.
"""

from typing import Literal
import hmac
import os

from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

from .matching import select_legacy_match
from .native_core import native_status
from .moderation import moderate_text

app = FastAPI(title="CourseMates Python Orchestrator", version="1.0.0")


def _expected_internal_token() -> str:
    return os.environ.get("ORCHESTRATOR_INTERNAL_TOKEN", "")


async def require_internal_token(
    x_cm_internal_token: str | None = Header(default=None, alias="X-CM-Internal-Token"),
) -> None:
    expected = _expected_internal_token()
    if not expected:
        return
    if x_cm_internal_token is None or not hmac.compare_digest(x_cm_internal_token, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized")


class IcebreakerRequest(BaseModel):
    contractVersion: Literal[1]
    topic: str = Field(default="", max_length=2_000)
    discipline: str = Field(default="", max_length=2_000)
    campus: str = Field(default="", max_length=2_000)


class IcebreakerResponse(BaseModel):
    contractVersion: Literal[1] = 1
    source: Literal["python-local-fallback"] = "python-local-fallback"
    icebreakers: list[str]


class MatchParticipant(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    verified: bool
    interests: list[str] = Field(max_length=16)
    allowNormal: bool


class MatchSelectionRequest(BaseModel):
    contractVersion: Literal[1]
    candidate: MatchParticipant
    queued: list[MatchParticipant] = Field(max_length=10_000)


class ModerationRequest(BaseModel):
    contractVersion: Literal[1]
    text: str = Field(max_length=4_000)


@app.get("/internal/v1/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "contractVersion": 1,
        "mode": "shadow-only",
        "capabilities": ["icebreakers", "native-match-normalization"],
        "native": native_status(),
    }


@app.post("/internal/v1/icebreakers", response_model=IcebreakerResponse, dependencies=[Depends(require_internal_token)])
def icebreakers(request: IcebreakerRequest) -> IcebreakerResponse:
    topic = request.topic.strip() or "your current study topic"
    return IcebreakerResponse(icebreakers=[
        f"What part of {topic} are you focusing on today?",
        "Which study method has been most useful for this subject?",
        "Is there a concept or assignment you want to compare approaches on?",
        "What would make this study session feel productive for you?",
    ])


@app.post("/internal/v1/match/select", dependencies=[Depends(require_internal_token)])
def match_select(request: MatchSelectionRequest) -> dict[str, object]:
    return {
        "contractVersion": 1,
        "selection": select_legacy_match(
            request.candidate.model_dump(),
            [participant.model_dump() for participant in request.queued],
        ),
    }


@app.post("/internal/v1/moderation", dependencies=[Depends(require_internal_token)])
def moderation(request: ModerationRequest) -> dict[str, object]:
    """Shadow comparison only; Node remains the browser enforcement boundary."""
    return {"contractVersion": 1, **moderate_text(request.text)}
