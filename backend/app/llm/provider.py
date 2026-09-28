import re
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, Set
from app.config import settings
from app.llm.templates import generate_template_summary

logger = logging.getLogger(__name__)


def extract_numbers_from_text(text: str) -> Set[float]:
    """Extract all integer and floating point numbers from text."""
    matches = re.findall(r"(?<![a-zA-Z_])[-+]?\d*\.?\d+(?![a-zA-Z_])", text)
    nums = set()
    for m in matches:
        try:
            val = float(m)
            nums.add(round(val, 2))
        except ValueError:
            continue
    return nums


def extract_numbers_from_facts(facts: Dict[str, Any]) -> Set[float]:
    """Recursively extract all numbers present in the facts dictionary."""
    numbers = set()

    def _recurse(val):
        if isinstance(val, (int, float)):
            numbers.add(round(float(val), 2))
        elif isinstance(val, dict):
            for v in val.values():
                _recurse(v)
        elif isinstance(val, (list, tuple, set)):
            for item in val:
                _recurse(item)
        elif isinstance(val, str):
            extracted = extract_numbers_from_text(val)
            numbers.update(extracted)

    _recurse(facts)
    # Also permit 100 as denominator/max scale and 0/1 base values
    numbers.update({0.0, 1.0, 100.0})
    return numbers


def validate_narrative_numbers(narrative: str, facts: Dict[str, Any]) -> bool:
    """
    Strict validation: LLM may ONLY narrate numbers passed to it in the input facts.
    If any number in narrative is not in facts, validation fails.
    """
    text_numbers = extract_numbers_from_text(narrative)
    fact_numbers = extract_numbers_from_facts(facts)

    for num in text_numbers:
        # Check if number matches any fact number within tolerance
        if not any(abs(num - fact_num) < 0.05 for fact_num in fact_numbers):
            logger.warning(
                f"Hallucination check failed: number {num} in generated narrative was not found in input facts!"
            )
            return False
    return True


class BaseLLMProvider(ABC):
    @abstractmethod
    def generate_narrative(self, facts: Dict[str, Any]) -> str:
        """Generate narrative text based strictly on provided facts."""
        pass


class NoneProvider(BaseLLMProvider):
    def generate_narrative(self, facts: Dict[str, Any]) -> str:
        return generate_template_summary(facts)


class GeminiProvider(BaseLLMProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key

    def generate_narrative(self, facts: Dict[str, Any]) -> str:
        if not self.api_key:
            return generate_template_summary(facts)
        try:
            import httpx
            prompt = (
                "You are an analytical assistant for Savomart retail expansion in Chennai.\n"
                "Explain the following area fitness score metrics in 3-4 concise sentences.\n"
                "CRITICAL CONSTRAINT: You MUST NOT invent, estimate, or hallucinate any numbers or percentages.\n"
                "You may ONLY mention the exact numerical values provided below.\n\n"
                f"FACTS:\n{facts}\n"
            )
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={self.api_key}"
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.1, "maxOutputTokens": 300}
            }
            resp = httpx.post(url, json=payload, timeout=8.0)
            if resp.status_code == 200:
                data = resp.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                if validate_narrative_numbers(text, facts):
                    return text
                logger.warning("Gemini generated invalid numbers; falling back to template.")
            else:
                logger.warning(f"Gemini API returned status {resp.status_code}")
        except Exception as e:
            logger.warning(f"Gemini generation failed: {e}")
        return generate_template_summary(facts)


class OpenAIProvider(BaseLLMProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key

    def generate_narrative(self, facts: Dict[str, Any]) -> str:
        if not self.api_key:
            return generate_template_summary(facts)
        try:
            import httpx
            prompt = (
                "You are an analytical assistant for Savomart retail expansion in Chennai.\n"
                "Explain the following area fitness metrics in 3-4 concise sentences.\n"
                "CRITICAL CONSTRAINT: You MUST NOT invent, extrapolate, or hallucinate any numbers.\n"
                "You may ONLY use exact numbers from the facts below.\n\n"
                f"FACTS:\n{facts}\n"
            )
            headers = {"Authorization": f"Bearer {self.api_key}"}
            payload = {
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 300
            }
            resp = httpx.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=8.0)
            if resp.status_code == 200:
                data = resp.json()
                text = data["choices"][0]["message"]["content"].strip()
                if validate_narrative_numbers(text, facts):
                    return text
                logger.warning("OpenAI generated invalid numbers; falling back to template.")
        except Exception as e:
            logger.warning(f"OpenAI generation failed: {e}")
        return generate_template_summary(facts)


class AnthropicProvider(BaseLLMProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key

    def generate_narrative(self, facts: Dict[str, Any]) -> str:
        if not self.api_key:
            return generate_template_summary(facts)
        try:
            import httpx
            prompt = (
                "You are an analytical assistant for Savomart retail expansion in Chennai.\n"
                "Explain the following area fitness metrics in 3-4 concise sentences.\n"
                "CRITICAL CONSTRAINT: You MUST NOT invent or hallucinate numbers.\n"
                "You may ONLY use exact numbers from the facts below.\n\n"
                f"FACTS:\n{facts}\n"
            )
            headers = {
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            }
            payload = {
                "model": "claude-3-haiku-20240307",
                "max_tokens": 300,
                "messages": [{"role": "user", "content": prompt}]
            }
            resp = httpx.post("https://api.anthropic.com/v1/messages", headers=headers, json=payload, timeout=8.0)
            if resp.status_code == 200:
                data = resp.json()
                text = data["content"][0]["text"].strip()
                if validate_narrative_numbers(text, facts):
                    return text
                logger.warning("Anthropic generated invalid numbers; falling back to template.")
        except Exception as e:
            logger.warning(f"Anthropic generation failed: {e}")
        return generate_template_summary(facts)


def get_llm_provider() -> BaseLLMProvider:
    provider = settings.LLM_PROVIDER.lower().strip()
    if provider == "gemini" and settings.GEMINI_API_KEY:
        return GeminiProvider(settings.GEMINI_API_KEY)
    elif provider == "openai" and settings.OPENAI_API_KEY:
        return OpenAIProvider(settings.OPENAI_API_KEY)
    elif provider == "anthropic" and settings.ANTHROPIC_API_KEY:
        return AnthropicProvider(settings.ANTHROPIC_API_KEY)
    return NoneProvider()
