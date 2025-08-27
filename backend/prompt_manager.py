import yaml
from pathlib import Path

class PromptManager:
    def __init__(self, 
                 prompt_dir: str = "prompts",
                 environment: str = "production",
                 ):
        self.prompt_dir = Path(prompt_dir)
        self.environment = environment
        
        self.prompt_dir.mkdir(parents=True, exist_ok=True)
        self.config = {}
        
        self._load_prompt_file()
    
    def _load_prompt_file(self):
        filepath = self.prompt_dir / "prompts.yaml"

        with open(filepath, 'r', encoding='utf-8') as f:
            self.config = yaml.safe_load(f).get("agents", {})
    
    def get_prompt(self, 
                   agent_name: str, 
                   prompt_type: str = 'system_prompt'):
        if agent_name not in self.config:
            return None
        
        agent_prompts = self.config[agent_name]
        return agent_prompts.get(prompt_type)
    
    def get_model_config(self, agent_name: str):
        """Get model configuration for an agent."""
        if agent_name not in self.config:
            return {}
        
        return self.config[agent_name].get('config', {})