import re
from functools import lru_cache

import tiktoken

from app.ingestion.types import Section

_HEADING_PATTERN = re.compile(
    r"^(?P<hashes>#{1,6})\s+(?:(?P<num>\d+(?:\.\d+)*|[A-Z]\.\d+)\.?\s+)?(?P<title>.+)$"
    r"|^(?P<numbered>\d+(?:\.\d+)+)\s+(?P<num_title>[A-Z][^\n]{1,120})$",
    re.MULTILINE,
)


@lru_cache(maxsize=1)
def _get_encoding() -> tiktoken.Encoding:
    return tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str) -> int:
    """Count approximate tokens using cl100k_base tokenizer."""
    if not text:
        return 0
    return len(_get_encoding().encode(text))


def split_into_sections(normalized_text: str) -> list[Section]:
    """Identify structural sections using headings and source offsets."""
    matches = list(_HEADING_PATTERN.finditer(normalized_text))
    if not matches:
        return [
            Section(
                section_number="1",
                section_title="Document Body",
                text=normalized_text.strip(),
                start_offset=0,
                end_offset=len(normalized_text),
                token_count=count_tokens(normalized_text),
            )
        ]

    sections: list[Section] = []
    auto_counter = 1

    # Capture any preamble before the first heading
    first_start = matches[0].start()
    preamble = normalized_text[:first_start].strip()
    if preamble:
        sections.append(
            Section(
                section_number="0",
                section_title="Preamble",
                text=preamble,
                start_offset=0,
                end_offset=first_start,
                token_count=count_tokens(preamble),
            )
        )

    for idx, match in enumerate(matches):
        start_offset = match.start()
        end_offset = matches[idx + 1].start() if idx + 1 < len(matches) else len(normalized_text)
        section_body = normalized_text[start_offset:end_offset].strip()
        if not section_body:
            continue

        explicit_num = match.group("num") or match.group("numbered")
        title = (match.group("title") or match.group("num_title") or "").strip()
        section_number = explicit_num if explicit_num else str(auto_counter)
        auto_counter += 1

        sections.append(
            Section(
                section_number=section_number,
                section_title=title or f"Section {section_number}",
                text=section_body,
                start_offset=start_offset,
                end_offset=end_offset,
                token_count=count_tokens(section_body),
            )
        )

    return sections