import re
import unicodedata

from app.core.errors import ValidationError

MIN_EXTRACTABLE_CHARS = 20


def normalize_text(raw_text: str, min_chars: int = MIN_EXTRACTABLE_CHARS) -> str:
    """Normalize Unicode (NFKC), line endings, whitespace, and headings, and validate minimum text."""
    if not raw_text:
        raise ValidationError(
            "Document contains no extractable text.",
            code="insufficient_text",
        )

    # 1. Normalize Unicode compatibility characters
    normalized = unicodedata.normalize("NFKC", raw_text)

    # 2. Normalize line endings to \n and strip null/control chars (except \n and \t)
    normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")
    normalized = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", normalized)

    # 3. Normalize horizontal whitespace within lines and standardize markdown headings
    cleaned_lines: list[str] = []
    for line in normalized.split("\n"):
        collapsed = re.sub(r"[ \t]+", " ", line).strip()
        heading_match = re.match(r"^(#{1,6})\s*(.+)$", collapsed)
        if heading_match:
            collapsed = f"{heading_match.group(1)} {heading_match.group(2).strip()}"
        cleaned_lines.append(collapsed)

    # 4. Collapse 3+ consecutive newlines into double newline paragraph breaks
    result = "\n".join(cleaned_lines)
    result = re.sub(r"\n{3,}", "\n\n", result).strip()

    validate_minimum_text(result, min_chars=min_chars)
    return result


def validate_minimum_text(text: str, min_chars: int = MIN_EXTRACTABLE_CHARS) -> None:
    """Reject empty or near-empty extracted text."""
    non_ws_length = len(re.sub(r"\s+", "", text or ""))
    if non_ws_length < min_chars:
        raise ValidationError(
            f"Document contains insufficient extractable text ({non_ws_length} non-whitespace characters, minimum {min_chars}).",
            code="insufficient_text",
        )