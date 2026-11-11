
import math
import re
from collections import defaultdict

from app.config import settings
from app.rag.generation.ollama_client import OllamaClient
from app.rag.vector_store.qdrant_store import QdrantStore
from app.rag.quiz.quiz_schema import QuizResponse


class QuizGenerator:
    """
    Generates quizzes from subject documents using small,
    sequential Ollama generation requests.
    """

    SYSTEM_PROMPT = """
You are SnapClass, an educational quiz-generation assistant.

Generate questions ONLY from the supplied document content.

Rules:
1. Do not use outside knowledge to invent facts.
2. Generate exactly the requested number of questions.
3. Every question must have exactly four distinct options.
4. Exactly one option must be correct.
5. The correct_answer must exactly match one of the options.
6. Explanations must be supported by the supplied content.
7. Use only these difficulty values for each question: easy, medium, hard. Never use 'mixed' as a question's difficulty.
8. Avoid repeating the same question or testing the same fact.
9. Each question must cite exactly one source chunk from the supplied content.
   Set source_document to the single Document ID of that chunk (never combine multiple document names).
   Set source_location to the exact Location of that chunk.
10. Return only valid JSON matching the requested structure.
"""

    ALLOWED_DIFFICULTIES = {
        "easy",
        "medium",
        "hard",
    }

    def __init__(
        self,
        qdrant_store: QdrantStore,
        ollama_client: OllamaClient,
        questions_per_batch: int = 2,
        chunks_per_batch: int = 4,
        max_retries: int = 2,
    ):
        self.qdrant_store = qdrant_store
        self.ollama_client = ollama_client

        if questions_per_batch < 1:
            raise ValueError("questions_per_batch must be at least 1")

        if chunks_per_batch < 1:
            raise ValueError("chunks_per_batch must be at least 1")

        if max_retries < 0:
            raise ValueError("max_retries cannot be negative")

        self.questions_per_batch = questions_per_batch
        self.chunks_per_batch = chunks_per_batch
        self.max_retries = max_retries

    # ---------------------------------------------------------
    # CHUNK SELECTION
    # ---------------------------------------------------------

    @staticmethod
    def _interleave_document_chunks(chunks: list[dict]) -> list[dict]:
        """
        Interleave chunks from different documents.

        This prevents selection from being dominated by the
        first document when chunks are sorted by document ID.
        """

        documents = defaultdict(list)

        for chunk in chunks:
            document_id = chunk.get("document_id")

            if chunk.get("text", "").strip():
                documents[document_id].append(chunk)

        interleaved = []

        max_chunks = max(
            (len(document_chunks) for document_chunks in documents.values()),
            default=0,
        )

        for index in range(max_chunks):
            for document_chunks in documents.values():
                if index < len(document_chunks):
                    interleaved.append(document_chunks[index])

        return interleaved

    @staticmethod
    def _evenly_sample(
        chunks: list[dict],
        max_chunks: int,
    ) -> list[dict]:
        """
        Select representative chunks spread across the input.
        """

        if len(chunks) <= max_chunks:
            return chunks

        if max_chunks == 1:
            return [chunks[len(chunks) // 2]]

        selected_indices = [
            round(index * (len(chunks) - 1) / (max_chunks - 1))
            for index in range(max_chunks)
        ]

        return [chunks[index] for index in selected_indices]

    def _select_chunks_for_batch(
        self,
        chunks: list[dict],
        batch_index: int,
        total_batches: int,
    ) -> list[dict]:
        """
        Assign a representative selection of chunks to a batch.

        Each batch receives chunks from across the subject
        rather than always receiving the beginning of a document.
        """

        interleaved = self._interleave_document_chunks(chunks)

        # Divide the interleaved chunks across generation batches.
        batch_chunks = interleaved[batch_index::total_batches]

        # If there are too few chunks for all batches, reuse
        # representative chunks rather than sending empty context.
        if not batch_chunks:
            batch_chunks = interleaved

        return self._evenly_sample(
            batch_chunks,
            self.chunks_per_batch,
        )

    # ---------------------------------------------------------
    # PROMPT CONSTRUCTION
    # ---------------------------------------------------------

    @staticmethod
    def _build_context(chunks: list[dict]) -> str:
        """
        Build a small context containing explicit source references.
        """

        context_parts = []

        for index, chunk in enumerate(chunks, start=1):
            context_parts.append(
                f"[Source {index}]\n"
                f"Document ID: {chunk['document_id']}\n"
                f"Location: {chunk['location']}\n"
                f"Content:\n{chunk['text']}"
            )

        return "\n\n".join(context_parts)

    def _build_batch_prompt(
        self,
        subject_id: str,
        document_names: list[str],
        chunks: list[dict],
        question_count: int,
        difficulty: str,
        previous_questions: list[str],
    ) -> str:

        context = self._build_context(chunks)

        previous_questions_text = (
            "\n".join(
                f"- {question}"
                for question in previous_questions
            )
            if previous_questions
            else "None"
        )

        return f"""
SUBJECT ID:
{subject_id}

AVAILABLE DOCUMENTS IN THIS CONTEXT:
{", ".join(document_names)}

NUMBER OF QUESTIONS:
{question_count}

TARGET DIFFICULTY:
{difficulty}

DOCUMENT CONTENT:
{context}

FORBIDDEN QUESTIONS (ALREADY GENERATED - DO NOT REPEAT OR TEST THE SAME FACTS):
{previous_questions_text}

CRITICAL RULES:
- Generate questions ONLY from the supplied DOCUMENT CONTENT.
- Do NOT repeat, rephrase, or test the same function or concept as any question in the FORBIDDEN list.
- Each question must test a DISTINCT concept or operation from the content.
- For mixed difficulty, assign each individual question 'easy', 'medium', or 'hard' (never 'mixed').

Every question must:
- Have exactly four distinct options.
- Have exactly one correct answer matching one of the options.
- Include a clear explanation based on the content.
- Cite exactly ONE source chunk: use its exact single Document ID for source_document (never combine multiple documents) and its exact Location for source_location.
- Have a difficulty of 'easy', 'medium', or 'hard'.

Return JSON in exactly this structure:

{{
    "title": "Quiz title",
    "subject_id": "{subject_id}",
    "total_questions": {question_count},
    "questions": [
        {{
            "question": "Question text",
            "options": [
                "Option A",
                "Option B",
                "Option C",
                "Option D"
            ],
            "correct_answer": "One exact option",
            "explanation": "Explanation based on the documents",
            "difficulty": "easy",
            "source_document": "Exact single document ID",
            "source_location": "Exact source location"
        }}
    ]
}}

Generate exactly {question_count} questions.
Return only JSON. Do not include Markdown or additional text.
"""

    # ---------------------------------------------------------
    # VALIDATION
    # ---------------------------------------------------------

    def _validate_batch(
        self,
        quiz: QuizResponse,
        subject_id: str,
        expected_count: int,
        valid_sources: set[tuple],
        previous_questions: list[str] | None = None,
    ):
        """
        Validate the generated batch before combining it.
        """

        if quiz.subject_id != subject_id:
            raise ValueError(
                "Generated batch contains an incorrect subject ID"
            )

        if quiz.total_questions != expected_count:
            raise ValueError(
                f"Expected {expected_count} questions, "
                f"received {quiz.total_questions}"
            )

        if len(quiz.questions) != expected_count:
            raise ValueError(
                f"Expected {expected_count} questions in questions list, "
                f"received {len(quiz.questions)}"
            )

        # Build normalized lookup for valid sources: (doc_norm, loc_norm) -> (doc_orig, loc_orig)
        source_lookup = {}
        for doc, loc in valid_sources:
            norm_key = (str(doc).strip().casefold(), str(loc).strip().casefold())
            source_lookup[norm_key] = (str(doc), str(loc))

        seen_batch_questions = set()
        normalized_previous = {
            self._normalize_question(q) for q in (previous_questions or [])
        }

        for question in quiz.questions:
            normalized_q = self._normalize_question(question.question)

            if normalized_q in seen_batch_questions:
                raise ValueError(
                    f"Generated batch contains duplicate questions: {question.question}"
                )
            seen_batch_questions.add(normalized_q)

            if normalized_q in normalized_previous:
                raise ValueError(
                    f"Generated question duplicates an earlier question: {question.question}"
                )

            if question.difficulty not in {
                "easy",
                "medium",
                "hard",
            }:
                raise ValueError(
                    f"Invalid difficulty: {question.difficulty}"
                )

            if len(question.options) != 4:
                raise ValueError(
                    "A generated question must contain exactly four options"
                )

            if len(set(question.options)) != 4:
                raise ValueError(
                    "A generated question contains duplicate options"
                )

            if question.correct_answer not in question.options:
                raise ValueError(
                    "The correct answer does not match any option"
                )

            # Match source reference with case/whitespace tolerance
            doc_norm = question.source_document.strip().casefold()
            loc_norm = question.source_location.strip().casefold()

            canonical_source = source_lookup.get((doc_norm, loc_norm))

            # If not matched directly, check if the LLM listed combined doc names e.g. "FDA, pdfdocument"
            if not canonical_source:
                candidate_docs = [
                    d.strip().casefold()
                    for d in re.split(r"[,/]| and ", question.source_document)
                    if d.strip()
                ]
                for c_doc in candidate_docs:
                    if (c_doc, loc_norm) in source_lookup:
                        canonical_source = source_lookup[(c_doc, loc_norm)]
                        break

            if not canonical_source:
                raise ValueError(
                    "Generated question refers to an invalid source: "
                    f"('{question.source_document}', '{question.source_location}')"
                )

            # Normalize to canonical source reference
            question.source_document, question.source_location = canonical_source

    @staticmethod
    def _normalize_question(question: str) -> str:
        """
        Normalize question text for duplicate detection.
        """

        return re.sub(
            r"[^a-z0-9]+",
            " ",
            question.lower(),
        ).strip()

    # ---------------------------------------------------------
    # SINGLE BATCH GENERATION
    # ---------------------------------------------------------

    def _generate_batch(
        self,
        subject_id: str,
        document_names: list[str],
        chunks: list[dict],
        question_count: int,
        difficulty: str,
        previous_questions: list[str],
        valid_sources: set[tuple],
        all_chunks: list[dict] | None = None,
        batch_index: int = 0,
        total_batches: int = 1,
    ) -> QuizResponse:
        """
        Generate one small batch of questions.

        Retries if the response cannot be parsed or validated.
        """

        last_error = None
        total_attempts = self.max_retries + 1

        for attempt in range(total_attempts):

            if attempt > 0 and all_chunks:
                current_chunks = self._select_chunks_for_batch(
                    chunks=all_chunks,
                    batch_index=batch_index + attempt,
                    total_batches=total_batches,
                )
            else:
                current_chunks = chunks

            current_doc_names = list(dict.fromkeys(
                str(c["document_id"])
                for c in current_chunks
                if c.get("document_id") is not None
            ))

            user_prompt = self._build_batch_prompt(
                subject_id=subject_id,
                document_names=current_doc_names,
                chunks=current_chunks,
                question_count=question_count,
                difficulty=difficulty,
                previous_questions=previous_questions,
            )

            if last_error:
                user_prompt += (
                    f"\n\nCRITICAL FIX: Your previous generation attempt failed validation with error: {last_error}.\n"
                    "Do NOT generate the same question or test the same concept. Choose a different concept/chunk."
                )

            current_temp = min(0.6, 0.2 + attempt * 0.2)

            try:
                print(
                    f"Generating batch: "
                    f"{question_count} question(s), "
                    f"{len(current_chunks)} chunk(s), "
                    f"attempt {attempt + 1}/{total_attempts}"
                )

                batch_num_predict = min(
                    settings.OLLAMA_NUM_PREDICT,
                    max(384, question_count * 250),
                )

                raw_response = self.ollama_client.generate(
                    system_prompt=self.SYSTEM_PROMPT,
                    user_prompt=user_prompt,
                    json_mode=True,
                    num_predict=batch_num_predict,
                    temperature=current_temp,
                )

                quiz = QuizResponse.model_validate_json(raw_response)

                self._validate_batch(
                    quiz=quiz,
                    subject_id=subject_id,
                    expected_count=question_count,
                    valid_sources=valid_sources,
                    previous_questions=previous_questions,
                )

                return quiz

            except Exception as error:
                last_error = error

                print(
                    f"Batch generation attempt {attempt + 1} failed: "
                    f"{error}"
                )

        raise ValueError(
            f"Failed to generate a valid batch after {total_attempts} attempts: "
            f"{last_error}"
        ) from last_error

    # ---------------------------------------------------------
    # COMPLETE QUIZ GENERATION
    # ---------------------------------------------------------

    def generate_quiz(
        self,
        subject_id: str,
        number_of_questions: int = 5,
        difficulty: str = "mixed",
        document_ids: list[str] | None = None,
    ) -> QuizResponse:

        if not subject_id:
            raise ValueError("subject_id cannot be empty")

        if not 1 <= number_of_questions <= 20:
            raise ValueError(
                "number_of_questions must be between 1 and 20"
            )

        allowed_difficulties = {
            "easy",
            "medium",
            "hard",
            "mixed",
        }

        if difficulty not in allowed_difficulties:
            raise ValueError("Invalid difficulty")

        if document_ids is not None and not document_ids:
            raise ValueError(
                "document_ids cannot be an empty list"
            )

        # 1. Retrieve chunks only from the requested documents.
        print("Retrieving document chunks from Qdrant...")

        chunks = self.qdrant_store.get_subject_chunks(
            subject_id=subject_id,
            document_ids=document_ids,
        )

        if not chunks:
            raise ValueError(
                f"No document chunks found for subject: {subject_id}"
            )

        # 2. Remove empty chunks.
        chunks = [
            chunk for chunk in chunks
            if chunk.get("text", "").strip()
        ]

        if not chunks:
            raise ValueError("Subject contains no usable text")

        # 3. Organize document IDs and valid source references.
        document_names = list(dict.fromkeys(
            str(chunk["document_id"])
            for chunk in chunks
            if chunk.get("document_id") is not None
        ))

        valid_sources = {
            (chunk["document_id"], chunk["location"])
            for chunk in chunks
        }

        if not valid_sources:
            raise ValueError(
                "No valid document source references were found"
            )

        # 4. Determine the number of generation batches.
        total_batches = math.ceil(
            number_of_questions / self.questions_per_batch
        )

        print(f"Total chunks available: {len(chunks)}")
        print(f"Documents available: {len(document_names)}")
        print(f"Generation batches: {total_batches}")

        generated_questions = []
        previous_questions = []
        quiz_title = None

        # 5. Generate batches sequentially.
        for batch_index in range(total_batches):

            remaining_questions = (
                number_of_questions - len(generated_questions)
            )

            current_question_count = min(
                self.questions_per_batch,
                remaining_questions,
            )

            selected_chunks = self._select_chunks_for_batch(
                chunks=chunks,
                batch_index=batch_index,
                total_batches=total_batches,
            )

            print(
                f"\nStarting batch {batch_index + 1}/{total_batches}"
            )

            batch_document_names = list(dict.fromkeys(
                str(c["document_id"])
                for c in selected_chunks
                if c.get("document_id") is not None
            ))

            batch_quiz = self._generate_batch(
                subject_id=subject_id,
                document_names=batch_document_names,
                chunks=selected_chunks,
                question_count=current_question_count,
                difficulty=difficulty,
                previous_questions=previous_questions,
                valid_sources=valid_sources,
                all_chunks=chunks,
                batch_index=batch_index,
                total_batches=total_batches,
            )

            if quiz_title is None:
                quiz_title = batch_quiz.title

            for question in batch_quiz.questions:
                generated_questions.append(question)
                previous_questions.append(question.question)

            print(
                f"Batch {batch_index + 1} completed. "
                f"Total questions generated: "
                f"{len(generated_questions)}/{number_of_questions}"
            )

        # 6. Verify the complete quiz.
        if len(generated_questions) != number_of_questions:
            raise ValueError(
                f"Expected {number_of_questions} questions, "
                f"generated {len(generated_questions)}"
            )

        # 7. Build and validate the final combined response.
        final_quiz = QuizResponse(
            title=quiz_title or "Generated Quiz",
            subject_id=subject_id,
            total_questions=len(generated_questions),
            questions=generated_questions,
        )

        self._validate_batch(
            quiz=final_quiz,
            subject_id=subject_id,
            expected_count=number_of_questions,
            valid_sources=valid_sources,
        )

        print("\nQuiz generation completed successfully.")

        return final_quiz
