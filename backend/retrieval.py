import os
import re
import json
from collections import defaultdict
import xml.etree.ElementTree as ET
import numpy as np

from langchain_google_genai import GoogleGenerativeAIEmbeddings
import faiss

def extract_qa_from_slack_xmls(data_dir):
    conversations = defaultdict(str)
    for root, dirs, files in os.walk(data_dir):
        for filename in files:
            if filename.endswith('.xml'):
                filepath = os.path.join(root, filename)
                tree = ET.parse(filepath)
                xml_root = tree.getroot()
                team_domain = xml_root.find('team_domain').text
                channel_name = xml_root.find('channel_name').text
                for message in xml_root.findall('message'):
                    conv_id = message.get('conversation_id')+f"_{team_domain}"+f"_{channel_name}"
                    if conversations[conv_id]:
                        text = message.find('text').text
                        text = text if text else ''
                        conversations[conv_id]+= text+"\n"
                    else:
                        text = message.find('text').text
                        text = text if text else ''
                        conversations[conv_id]= text+"\n"
    def decouple_id_and_names(data):
        id, team_domain, channel_name = data[0].split('_')
        return {'id':id, 'text': data[1], 'metadata':{'team_domain':team_domain, 'channel_name':channel_name}}

    conversations_data = list(map(lambda x: decouple_id_and_names(x),tuple(conversations.items())))
    return conversations_data


class EmeddingModel:
    def __init__(self, model_id = "models/text-embedding-004"):
        self.model = GoogleGenerativeAIEmbeddings(
                    model=model_id,
                    )
        
    def embed(self, text):
        return self.model.embed_documents(text)

class VectorSearch:
    def __init__(self, db_path: str = './retrieval', dim: int = 768, num_edges: int = 32, ef_construction: int = 40):
        self.db_path = db_path
        self.dim = dim
        self.num_edges = num_edges
        self.ef_construction = ef_construction
        self.index_path = os.path.join(db_path, 'faiss.index')
        self.doc_db_path = os.path.join(db_path, 'doc_db.json')
        self.query_log_db_path = os.path.join(db_path, 'query_log_db.json')
        self.documents = []
        self.query_log = []
        self.indexes = None
        self.embed_model = EmeddingModel()

        if os.path.exists(self.index_path) and os.path.exists(self.doc_db_path):
            self._load_from_disk()
        else:
            self.indexes = faiss.IndexHNSWFlat(self.dim, self.num_edges)
            self.indexes.hnsw.efConstruction = self.ef_construction
            data_db_path = '../data/clojurians/2019'
            documents = extract_qa_from_slack_xmls(data_db_path)
            self.index(documents)

    def _load_from_disk(self):
        self.indexes = faiss.read_index(self.index_path)

        with open(self.doc_db_path, 'r') as f:
            self.documents = json.load(f)

        # with open(self.query_log_db_path, 'r') as f:
        #     self.query_log = json.load(f)

    def _save_to_disk(self):
        os.makedirs(self.db_path, exist_ok=True)
        faiss.write_index(self.indexes, self.index_path)
        with open(self.doc_db_path, 'w') as f:
            json.dump(self.documents, f, indent=2)

    def index(self, documents):
        def parse_text(documents, max_tokens=512):
            WORDS_PER_TOKEN = 0.75
            max_words = int(max_tokens * WORDS_PER_TOKEN)
            
            text = documents['text']
            text = preprocess_code_heavy_text(text)
            words = text.split()
            
            if len(words) > max_words:
                words = words[:max_words]
            return " ".join(words)

        def preprocess_code_heavy_text(text, max_chars = 1500):
            text = text.replace('&gt;', '>')
            text = text.replace('&lt;', '<')
            text = text.replace('&amp;', '&')
            text = text.replace('&quot;', '"')
            text = re.sub(r'```[\s\S]*?```', ' [CODE BLOCK] ', text)
            text = re.sub(r'`[^`]+`', ' [CODE] ', text)
            text = re.sub(r'https?://\S+', ' [URL] ', text)
            text = re.sub(r'#object\[[^\]]+\]', ' [JAVA_OBJECT] ', text)
            text = re.sub(r'\(ins\)', '', text)
            text = re.sub(r'\(cmd\)', '', text)
            text = re.sub(r'=>', ' to ', text)
            text = re.sub(r'[(){}\[\]<>]', ' ', text)
            text = re.sub(r'\s+', ' ', text).strip()
            if len(text) > max_chars:
                text = text[:max_chars].rsplit(' ', 1)[0]
            return text

        text = list(map(lambda x: parse_text(x), documents))
        embeddings = np.array(self.embed_model.embed(text), dtype=np.float32)
        self.indexes.add(embeddings)
        self.documents+=documents
        self._save_to_disk()

    def query(self, query, k = 3):
        embedding = np.array(self.embed_model.embed([query]), dtype=np.float32)
        distances, indices = self.indexes.search(embedding.reshape(1, -1), k)
        results = []
        retrieved_docs = []
        for idx, dist in zip(indices[0], distances[0]):
            if idx >=0:
                document = self.documents[idx]
                retrieved_docs.append(document['id'])
                result = {
                    'id': document['id'],
                    'text': document['text'],
                    'metadata': document['metadata'],
                    'score': float(1.0/(1.0+dist))
                }
                results.append(result)

        self.query_log.append({
            "query": query,
            "retrieved_ids": retrieved_docs,
        })
        return results