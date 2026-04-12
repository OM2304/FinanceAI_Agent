import os
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

# Load .env file
load_dotenv()

def get_llm(tools=None):
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GOOGLE_API_KEY or GEMINI_API_KEY is required to initialize Gemini."
        )

    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        temperature=0,
        google_api_key=api_key
    )
    if tools:
        try:
            return llm.bind_tools(tools)
        except Exception:
            return llm
    return llm
