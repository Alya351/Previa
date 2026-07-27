import os
from pathlib import Path

from dotenv import load_dotenv
from groq import Groq

load_dotenv(Path(__file__).resolve().parent.parent.parent / "llm" / ".env")

client = Groq(api_key=os.environ["GROQ_API_KEY"])
MODEL = "llama-3.1-8b-instant"

SYSTEM_PROMPT = (
    "Tu réponds à des questions sur un bâtiment surveillé par YANFLÈ. On te donne "
    "l'état actuel exact du bâtiment (caméras, personnes, autorisations, dernière "
    "activité par caméra).\n\n"
    "RÈGLE ABSOLUE : tu ne réponds QU'à partir des données fournies. Si l'information "
    "demandée n'y figure pas, dis clairement \"je ne sais pas\" ou \"cette information "
    "n'est pas disponible\" — ne suppose JAMAIS, ne devine JAMAIS, n'invente JAMAIS un "
    "fait, un nom, une caméra ou un événement qui n'est pas dans les données.\n\n"
    "Réponds en français, de façon directe et factuelle, en 1 à 3 phrases maximum."
)


def ask(question: str, context: str) -> str:
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"DONNÉES ACTUELLES DU BÂTIMENT :\n{context}\n\nQUESTION : {question}"},
        ],
        max_tokens=150,
        temperature=0.2,
    )
    return response.choices[0].message.content.strip()
