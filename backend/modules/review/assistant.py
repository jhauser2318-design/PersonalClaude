"""The AI summary of your week (only runs when you click "Summarize my week")."""
import anthropic

from ... import ai_models, config
from ..assistant.claude_client import AssistantError

SYSTEM = """You write a short weekly review for the user of a personal dashboard, from the week's data.
Write in second person, warm but direct, plain text (no markdown headings, no bold). Structure:
- one or two sentences on how the week went overall,
- "Wins:" then 2-4 bullet points starting with "- ",
- "Watch:" then 1-3 bullet points (slipping routines, overdue tasks, overspending, falling behind on study),
- "Suggested priorities for next week:" then 3 bullet points, each a concrete action.
Use only the data given; don't invent numbers. Keep it under 220 words."""


def summarize(stats_text: str, reflections: str) -> str:
    if not config.api_key_configured():
        raise AssistantError("No Anthropic API key found. Add it to the .env file (see README), then restart the app.")
    request = dict(max_tokens=1500, system=SYSTEM,
                   messages=[{"role": "user", "content": f"<week>\n{stats_text}\n</week>\n\n<my notes>\n{reflections or '(none)'}\n</my notes>"}],
                   **ai_models.request_options("review", "low"))
    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    try:
        response = client.beta.messages.create(**request)
        ai_models.record("review", response, request["model"])
    except anthropic.AuthenticationError:
        raise AssistantError("Anthropic rejected the API key. Check ANTHROPIC_API_KEY in your .env file.")
    except anthropic.RateLimitError:
        raise AssistantError("Too many requests right now (or your credit ran out). Try again in a minute.")
    except anthropic.APIStatusError as e:
        raise AssistantError(f"Anthropic's servers returned an error ({e.status_code}). Try again shortly.")
    except anthropic.APIConnectionError:
        raise AssistantError("Couldn't reach Anthropic. Check your internet connection.")
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    if not text:
        raise AssistantError("Claude returned an empty summary. Please try again.")
    return text
