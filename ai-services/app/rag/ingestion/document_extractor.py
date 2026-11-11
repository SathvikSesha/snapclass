
from dataclasses import dataclass
from pathlib import Path

import pytesseract

from pdf2image import convert_from_path

from pypdf import PdfReader
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph
from pptx import Presentation


class DocumentExtractionError(Exception):
    """Raised when a document cannot be extracted."""


@dataclass
class ExtractedSection:
    """One extracted section with its original location."""

    text: str
    source: str
    location: str
    extraction_method: str = "native_text"


@dataclass
class DocumentExtractionResult:
    """Complete extraction result for one document."""

    filename: str
    file_type: str
    total_sections: int
    total_characters: int
    sections: list[ExtractedSection]


def normalize_text(text: str) -> str:
    """
    Clean unnecessary whitespace without removing
    meaningful paragraph boundaries.
    """

    if not text:
        return ""

    text = text.replace("\xa0", " ")
    text = text.replace("\r\n", "\n")
    text = text.replace("\r", "\n")

    cleaned_lines = []

    for line in text.split("\n"):
        line = " ".join(line.split())

        if line:
            cleaned_lines.append(line)

    return "\n".join(cleaned_lines).strip()



def extract_pdf(file_path: Path) -> list[ExtractedSection]:
    """
    Extract text from every PDF page.

    First attempts normal PDF text extraction.
    If a page has no meaningful embedded text,
    OCR is used as a fallback.
    """

    reader = PdfReader(str(file_path))

    sections = []

    for page_number, page in enumerate(reader.pages, start=1):

        # First attempt: extract selectable PDF text.
        extracted_text = normalize_text(
            page.extract_text() or ""
        )

        # Check whether the page contains meaningful text.
        meaningful_characters = sum(
            character.isalnum()
            for character in extracted_text
        )

        if meaningful_characters >= 30:
            text = extracted_text
            extraction_method = "pdf_text"

        else:
            # Second attempt: use OCR for scanned/image pages.
            images = convert_from_path(
                str(file_path),
                first_page=page_number,
                last_page=page_number,
                dpi=200,
            )

            if images:
                ocr_text = pytesseract.image_to_string(
                    images[0],
                    lang="eng",
                )

                ocr_text = normalize_text(ocr_text)

                # Keep whichever extraction produced
                # more meaningful text.
                ocr_characters = sum(
                    character.isalnum()
                    for character in ocr_text
                )

                if ocr_characters > meaningful_characters:
                    text = ocr_text
                    extraction_method = "ocr"
                else:
                    text = extracted_text
                    extraction_method = "pdf_text"

            else:
                text = extracted_text
                extraction_method = "pdf_text"

        if text:
            sections.append(
                ExtractedSection(
                    text=text,
                    source="pdf",
                    location=f"page {page_number}",
                    extraction_method=extraction_method,
                )
            )
            print(
                f"Page {page_number}: "
                f"{extraction_method}"
            )

    return sections


def extract_docx(file_path: Path) -> list[ExtractedSection]:
    """Extract paragraphs and table rows from a Word document."""

    document = Document(str(file_path))

    sections = []

    paragraph_number = 0
    table_number = 0

    # Iterate through paragraphs and tables in document order.
    for block in document.iter_inner_content():

        if isinstance(block, Paragraph):
            paragraph_number += 1

            text = normalize_text(block.text)

            if text:
                sections.append(
                    ExtractedSection(
                        text=text,
                        source="docx",
                        location=f"paragraph {paragraph_number}",
                    )
                )

        elif isinstance(block, Table):
            table_number += 1

            for row_number, row in enumerate(block.rows, start=1):
                cells = []
                previous_text = None

                for cell in row.cells:
                    cell_text = normalize_text(cell.text)
                    if cell_text and cell_text != previous_text:
                        cells.append(cell_text)

                    previous_text = cell_text
                row_text = " | ".join(cells)

                if row_text:
                    sections.append(
                        ExtractedSection(
                            text=row_text,
                            source="docx",
                            location=(
                                f"table {table_number}, "
                                f"row {row_number}"
                            ),
                        )
                    )

    return sections


def extract_pptx(file_path: Path) -> list[ExtractedSection]:
    """Extract text slide by slide from PowerPoint."""

    presentation = Presentation(str(file_path))

    sections = []

    for slide_number, slide in enumerate(
        presentation.slides,
        start=1,
    ):
        slide_text = []

        for shape in slide.shapes:

            if shape.has_text_frame:
                text = normalize_text(shape.text)

                if text:
                    slide_text.append(text)

            if shape.has_table:
                for row in shape.table.rows:
                    cells = [
                        normalize_text(cell.text)
                        for cell in row.cells
                    ]

                    row_text = " | ".join(
                        cell for cell in cells if cell
                    )

                    if row_text:
                        slide_text.append(row_text)

        combined_text = normalize_text(
            "\n".join(slide_text)
        )

        if combined_text:
            sections.append(
                ExtractedSection(
                    text=combined_text,
                    source="pptx",
                    location=f"slide {slide_number}",
                )
            )

    return sections


def extract_document(file_path: str | Path) -> list[ExtractedSection]:
    """
    Detect document format and extract its content.
    """

    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(
            f"Document not found: {path}"
        )

    if not path.is_file():
        raise ValueError(
            f"Path is not a file: {path}"
        )

    if path.stat().st_size == 0:
        raise DocumentExtractionError(
            "The document is empty."
        )

    extension = path.suffix.lower()

    extractors = {
        ".pdf": extract_pdf,
        ".docx": extract_docx,
        ".pptx": extract_pptx,
    }

    extractor = extractors.get(extension)

    if extractor is None:
        raise ValueError(
            f"Unsupported document format: {extension}"
        )

    try:
        sections = extractor(path)

    except Exception as error:
        raise DocumentExtractionError(
            f"Failed to extract {path.name}: {error}"
        ) from error

    if not sections:
        raise DocumentExtractionError(
            f"No extractable text found in {path.name}. "
            "The document may be empty, scanned, or image-based."
        )

    return sections


def ingest_document(
    file_path: str | Path,
) -> DocumentExtractionResult:
    """
    Extract a complete document and return its content
    together with document-level metadata.
    """

    path = Path(file_path)

    sections = extract_document(path)

    total_characters = sum(
        len(section.text) for section in sections
    )

    return DocumentExtractionResult(
        filename=path.name,
        file_type=path.suffix.lower().lstrip("."),
        total_sections=len(sections),
        total_characters=total_characters,
        sections=sections,
    )
