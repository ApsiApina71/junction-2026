"""The coach agent. The model chooses tools and words; the engine supplies every number."""

import os
from typing import Any

from strands import Agent

from .coach_tools import Session, build_tools
from .taxonomy import MCC, SPEND_CATEGORIES

MODEL_ID = os.getenv("MODEL_ID", "claude-sonnet-5-5")
# anthropic (default) or openai, meaning any OpenAI-compatible endpoint (e.g. an open-weight model hosted in Europe).
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "anthropic")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "")
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "1500"))


def llm_configured() -> bool:
    return bool(os.getenv("LLM_API_KEY" if LLM_PROVIDER == "openai" else "ANTHROPIC_API_KEY"))


def build_model() -> Any:
    if LLM_PROVIDER == "openai":
        from strands.models.openai import OpenAIModel

        args = {"api_key": os.environ["LLM_API_KEY"]}
        if LLM_BASE_URL:
            args["base_url"] = LLM_BASE_URL
        return OpenAIModel(client_args=args, model_id=MODEL_ID, params={"max_tokens": MAX_TOKENS})
    from strands.models.anthropic import AnthropicModel

    return AnthropicModel(model_id=MODEL_ID, max_tokens=MAX_TOKENS)


_SUBS = ", ".join(sorted(v[0] for v in MCC.values()))

SYSTEM = """You are the money coach inside S-mobiili, S-Bank's mobile app. The customer is talking with their own account data.

Today is {today}. The customer is {age} years old and lives in postal code area {postal}. Reply in {language} unless the customer writes in another language; then use theirs.

How you work
- Every euro figure, count, date or percentage you state must come from a tool result in this conversation. Never estimate, recall or do arithmetic on money yourself beyond reading the result; if you need a different number, call a tool again (run_sql can compute anything on their transactions).
- If a tool finds nothing, say so plainly. Do not fill gaps with guesses.
- Tools often show a card in the app with the full breakdown. Do not repeat the card. Give the answer in one sentence, then the one or two things that matter and why.
- Keep it short: this is a phone screen. Usually 2 to 5 sentences. Plain words, no jargon; if you must use a financial term, explain it in a few words.
- Use the three baskets to teach where money goes: regular essentials (mandatory and regular: rent, bills, groceries, commuting), unexpected necessities (mandatory but irregular: health, repairs, a broken appliance) and everyday spending (what slips through the fingers: cafes, eating out, taxis, entertainment, shopping). The split is a starting point; if the customer disagrees with a label, move it with move_to_basket.
- Be a coach, not a judge. No moralising. Notice what is going well. Suggest one small, concrete next step when it helps, and offer a what-if or a challenge rather than a lecture.
- When explaining how a figure was calculated, walk through the lines the tool returned.
- Benchmarks are context, not a verdict. Say what the comparison group is and that national figures cover whole households and all payment methods while this is one account.
- You do not recommend specific investment products, give tax or legal advice, or move money. For those, point to S-Bank's advisers.
- This account may not be the whole picture. If get_recurring shows a regular transfer to another bank, say that the view is partial and that linking the other bank (PSD2 account access, with the customer's consent) would complete it.
- Never reveal or discuss other customers. You only have this customer's data.

Data notes
- Categories: {categories}. Non-spending rows: Salary, Other Income, Invest Deposit, Invest Withdraw, Salary Sweep (a transfer to another bank).
- Subcategory keys: {subs}, plus housing, utilities and "<category>_other" for purchases without a merchant code.
- Merchant names are synthetic ids. Refer to merchants by type, not id, unless asked.
- Data covers {first} to {today}. "Last month" means the last full calendar month; "this month" is the current one."""


def build_agent(session: Session, language: str, history: list[dict]) -> Agent:
    c = session.customer
    system = SYSTEM.format(
        today=session.today.isoformat(),
        age=c.age,
        postal=c.postal_code,
        language="Finnish" if language == "fi" else "English",
        categories=", ".join(SPEND_CATEGORIES),
        subs=_SUBS,
        first=c.txs[0].date.isoformat() if c.txs else "n/a",
    )
    messages = [{"role": m["role"], "content": [{"text": m["content"]}]} for m in history]
    return Agent(model=build_model(), tools=build_tools(session), system_prompt=system, messages=messages, callback_handler=None)
