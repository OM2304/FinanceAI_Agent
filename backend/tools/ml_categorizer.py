# backend/tools/ml_categorizer.py
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from .supabase_db import get_supabase_client # Assuming you have a DB fetcher

class AdaptiveCategorizer:
    def __init__(self):
        self.vectorizer = TfidfVectorizer()
        self.model = MultinomialNB()
        self.demo_data = [
            ("Zomato Swiggy Restaurant KFC", "Food"),
            ("Uber Ola Rickshaw Metro Rail", "Transport"),
            ("Amazon Flipkart Myntra", "Shopping"),
            ("Airtel Jio Electricity Bill", "Bills")
        ]
        self.train_model()

    def fetch_db_training_data(self):
        """Retrieves user-corrected transactions to improve accuracy"""
        supabase = get_supabase_client()
        # Fetching rows where user confirmed or corrected the category
        response = supabase.table("transactions").select("receiver, category").execute()
        db_records = [(r['receiver'], r['category']) for r in response.data]
        return db_records

    def train_model(self):
        # Combine static demo data with dynamic DB data
        db_data = self.fetch_db_training_data()
        combined_data = self.demo_data + db_data
        
        df = pd.DataFrame(combined_data, columns=['text', 'category'])
        if not df.empty:
            X = self.vectorizer.fit_transform(df['text'])
            self.model.fit(X, df['category'])

    def predict_category(self, merchant_name):
        X_new = self.vectorizer.transform([merchant_name])
        category = self.model.predict(X_new)[0]
        confidence = float(max(self.model.predict_proba(X_new)[0]))
        return category, confidence