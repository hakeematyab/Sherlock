import os
import xml.etree.ElementTree as ET
from collections import defaultdict
import pandas as pd
import numpy as np
from datasets import Dataset
from ragas import evaluate
from ragas.metrics import context_precision, context_recall
# from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from retrieval import VectorSearch

def extract_qa_from_xmls(data_dir, max_questions=3):
    qa_pairs = []
    done = False
    for root, _, files in os.walk(data_dir):
        for file in files:
            if file.endswith('.xml'):
                tree = ET.parse(os.path.join(root, file))
                conversations = defaultdict(list)
                for msg in tree.getroot().findall('message'):
                    conv_id = msg.get('conversation_id')
                    text = msg.find('text').text
                    if text:
                        conversations[conv_id].append(text)
                for conv_id, messages in conversations.items():
                    if len(messages) > 1:
                        qa_pairs.append({
                            'question': messages[0],
                            'ground_truth': "\n".join(messages[1:]),
                            'conv_id': conv_id
                        })
                    if len(qa_pairs)>=max_questions:
                        done = True
                        break
            if done:
                break
        if done:
            break
    
    return qa_pairs

def evaluate_retrieval(vector_search, qa_pairs, k=3):
    data = {'question': [], 'answer': [], 'contexts': [], 'ground_truth': []}
    
    for qa in qa_pairs:
        results = vector_search.query(qa['question'], k=k)
        contexts = [r['text'] for r in results]
        
        data['question'].append(qa['question'])
        data['ground_truth'].append(qa['ground_truth'])
        data['contexts'].append(contexts)
        data['answer'].append(contexts[0] if contexts else "")
    
    dataset = Dataset.from_dict(data)
    # llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash")
    llm = ChatGroq(model="llama-3.3-70b-versatile")
    return evaluate(
        dataset=dataset, 
        metrics=[context_precision, context_recall],
        llm=llm
    )

def main():
    vector_search = VectorSearch()
    
    qa_pairs = extract_qa_from_xmls('../data/clojurians/2019')
    print(f"Found {len(qa_pairs)} conversations")
    
    results = evaluate_retrieval(vector_search, qa_pairs)
    
    # rows = []
    # for qa in qa_pairs:
    #     retrieval = vector_search.query(qa['question'], k=1)
    #     rows.append({
    #         'conv_id': qa['conv_id'],
    #         'question': qa['question'][:100],
    #         'expected': qa['ground_truth'][:200],
    #         'retrieved': retrieval[0]['text'][:200] if retrieval else "",
    #         'score': retrieval[0]['score'] if retrieval else 0
    #     })
    
    # df = pd.DataFrame(rows)
    # print(results)
    # df.loc[len(df)] = {
    #     'conv_id': 'METRICS',
    #     'question': f"Total: {len(qa_pairs)}",
    #     'expected': f"Precision: {results['context_precision']}",
    #     'retrieved': f"Recall: {results['context_recall']}",
    #     # 'score': 0
    # }
    print(results)
    df = pd.DataFrame({
        "Precision": results['context_precision'],
        "Recall": results['context_recall']
    })
    
    os.makedirs('artifacts', exist_ok=True)
    df.to_csv('artifacts/eval.csv', index=False)
    
    print(f"Context Precision: {results['context_precision']}")
    print(f"Context Recall: {results['context_recall']}")

if __name__ == "__main__":
    main()