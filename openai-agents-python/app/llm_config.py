"""LLM provider configuration (OpenAI + DeepSeek + OpenRouter)."""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()

DEEPSEEK_BASE_URL = "https://api.deepseek.com"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


@dataclass(frozen=True)
class LLMSettings:
    provider: str
    model: str
    api_key: str
    base_url: str | None = None


def resolve_llm_settings(
    provider: str | None = None,
    model: str | None = None,
) -> LLMSettings:
    provider = (provider or os.getenv("LLM_PROVIDER") or "openai").lower().strip()
    if provider not in {"openai", "deepseek", "openrouter"}:
        raise ValueError(
            f"Unsupported provider: {provider}. Use openai|deepseek|openrouter."
        )

    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is required when provider=openai")
        default_model = os.getenv("MODEL") or "gpt-4.1-mini"
        return LLMSettings(
            provider=provider,
            model=model or default_model,
            api_key=api_key,
            base_url=None,
        )

    if provider == "deepseek":
        api_key = os.getenv("DEEPSEEK_API_KEY", "")
        if not api_key:
            raise ValueError("DEEPSEEK_API_KEY is required when provider=deepseek")
        default_model = os.getenv("MODEL") or "deepseek-chat"
        return LLMSettings(
            provider=provider,
            model=model or default_model,
            api_key=api_key,
            base_url=DEEPSEEK_BASE_URL,
        )

    api_key = os.getenv("OPENROUTER_API_KEY", "")
    if not api_key:
        raise ValueError("OPENROUTER_API_KEY is required when provider=openrouter")
    default_model = os.getenv("MODEL") or "google/gemini-2.5-flash-lite"
    return LLMSettings(
        provider=provider,
        model=model or default_model,
        api_key=api_key,
        base_url=OPENROUTER_BASE_URL,
    )


def build_chat_openai(settings: LLMSettings | None = None, **kwargs):
    """Build a LangChain ChatOpenAI client for OpenAI, DeepSeek, or OpenRouter."""
    from langchain_openai import ChatOpenAI

    settings = settings or resolve_llm_settings()
    params: dict = {
        "model": settings.model,
        "api_key": settings.api_key,
        "temperature": kwargs.pop("temperature", 0.2),
        **kwargs,
    }
    if settings.base_url:
        params["base_url"] = settings.base_url
    return ChatOpenAI(**params)
