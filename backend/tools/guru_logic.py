from langchain_openai import ChatOpenAI
from langchain.prompts import PromptTemplate

# Guru Philosophies based on Track A/B requirements 
GURU_DATABASE = {
    "robert_kiyosaki": {
        "name": "Robert Kiyosaki (Rich Dad Poor Dad)",
        "focus": "Assets vs. Liabilities",
        "principles": "Don't work for money, make money work for you. Focus on cash-flowing assets."
    },
    "ramit_sethi": {
        "name": "Ramit Sethi (I Will Teach You To Be Rich)",
        "focus": "Conscious Spending",
        "principles": "Spend extravagantly on things you love, but cut costs mercilessly on things you don't."
    },
    "warren_buffett": {
        "name": "Warren Buffett",
        "focus": "Value & Long-term Investing",
        "principles": "Do not save what is left after spending, but spend what is left after saving."
    }
}

class GuruAdvisor:
    def __init__(self):
        self.llm = ChatOpenAI(model="gpt-3.5-turbo")

    def get_advice(self, guru_key, spending_summary):
        guru = GURU_DATABASE.get(guru_key, GURU_DATABASE["ramit_sethi"])
        
        prompt = PromptTemplate.from_template("""
            You are a financial advisor channeling {guru_name}.
            Philosophy: {principles}
            User's Current Spending: {spending_summary}
            
            Provide a 3-sentence actionable advice plan in the style of this guru.
        """)
        
        chain = prompt | self.llm
        response = chain.invoke({
            "guru_name": guru["name"],
            "principles": guru["principles"],
            "spending_summary": spending_summary
        })
        return response.content