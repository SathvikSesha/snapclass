
import json

from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from socket import timeout as SocketTimeout

from app.config import settings


class OllamaClient:
    """
    Sends prompts to a locally running Ollama model.
    Generation settings are loaded from centralized configuration.
    """

    def __init__(
        self,
        model: str = settings.OLLAMA_MODEL,
        base_url: str = settings.OLLAMA_BASE_URL,
        timeout: int = settings.OLLAMA_TIMEOUT,
        num_ctx: int = settings.OLLAMA_NUM_CTX,
        num_predict: int = settings.OLLAMA_NUM_PREDICT,
        num_thread: int = settings.OLLAMA_NUM_THREAD,
        temperature: float = settings.OLLAMA_TEMPERATURE,
    ):
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.num_ctx = num_ctx
        self.num_predict = num_predict
        self.num_thread = num_thread
        self.temperature = temperature

    def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        json_mode: bool = False,
        num_predict: int | None = None,
        temperature: float | None = None,
    ) -> str:

        if not system_prompt or not user_prompt:
            raise ValueError(
                "system_prompt and user_prompt cannot be empty"
            )

        output_limit = (
            num_predict
            if num_predict is not None
            else self.num_predict
        )

        if output_limit < 1:
            raise ValueError("num_predict must be at least 1")

        temp = (
            temperature
            if temperature is not None
            else self.temperature
        )

        url = f"{self.base_url}/api/chat"

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
            "keep_alive": "15m",
            "options": {
                "temperature": temp,
                "num_ctx": self.num_ctx,
                "num_predict": output_limit,
                "num_thread": self.num_thread,
            },
        }

        if json_mode:
            payload["format"] = "json"

        request = Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urlopen(request, timeout=self.timeout) as response:
                result = json.loads(
                    response.read().decode("utf-8")
                )

            message = result.get("message", {})
            content = message.get("content")

            if not content:
                raise RuntimeError(
                    "Ollama returned an empty response."
                )

            return content

        except HTTPError as error:
            details = error.read().decode(
                "utf-8",
                errors="replace",
            )

            raise RuntimeError(
                f"Ollama returned HTTP {error.code}: {details}"
            ) from error

        except URLError as error:
            raise RuntimeError(
                "Could not connect to Ollama. "
                "Check that the Ollama service is running."
            ) from error

        except SocketTimeout as error:
            raise RuntimeError(
                f"Ollama request timed out after {self.timeout} seconds."
            ) from error

        except json.JSONDecodeError as error:
            raise RuntimeError(
                "Ollama returned an invalid JSON response."
            ) from error

        except (KeyError, TypeError) as error:
            raise RuntimeError(
                "Ollama returned an unexpected response structure."
            ) from error
